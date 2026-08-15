# push-via-api.ps1 — push a local repo's content to a GitHub repo via the Git Data API
# (for hosts where github.com:443 git traffic is blocked).
# Usage: powershell -File push-via-api.ps1 -Repo owner/name -Root C:\path\to\repo [-DescFile C:\path\desc.json]
param(
  [Parameter(Mandatory = $true)][string]$Repo,
  [Parameter(Mandatory = $true)][string]$Root,
  [string]$DescFile
)
$ErrorActionPreference = 'Stop'

# get token without printing it
$cred = "protocol=https`nhost=github.com`n`n" | git credential fill
$tok = (($cred | Select-String -Pattern '^password=').ToString()).Substring(9)
$headers = @{ 'User-Agent' = 'dsh-plugin-publish'; 'Authorization' = "token $tok" }

function Api($method, $path, $bodyObj) {
  $body = $null
  if ($null -ne $bodyObj) { $body = $bodyObj | ConvertTo-Json -Depth 12 }
  return Invoke-RestMethod -Uri "https://api.github.com$path" -Method $method -Headers $headers -ContentType 'application/json' -Body $body -TimeoutSec 60
}

# 0. ensure repo exists (create if missing); set description from UTF-8 file when given
$exists = $true
try { Api 'GET' "/repos/$Repo" | Out-Null } catch { $exists = $false }
if (-not $exists) {
  $create = @{ name = ($Repo -split '/')[1]; description = 'DSH plugin'; private = $false; has_issues = $true; has_wiki = $false }
  Api 'POST' '/user/repos' $create | Out-Null
  Write-Host "repo created: $Repo"
}
if ($DescFile -and (Test-Path $DescFile)) {
  $bytes = [System.IO.File]::ReadAllBytes($DescFile)
  $r = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo" -Method Patch -Headers $headers -ContentType 'application/json; charset=utf-8' -Body $bytes -TimeoutSec 60
  $marker = [string][char]0x4E2D
  Write-Host ("description set (contains CN marker: {0})" -f $r.description.Contains($marker))
}

# 0b. seed empty repo (Git Data API rejects blob creation on a repo with no commits)
$needsSeed = $false
try {
  Api 'GET' "/repos/$Repo/commits/main" | Out-Null
} catch {
  $needsSeed = $true
}
if ($needsSeed) {
  $seed = @{ message = 'chore: init seed'; content = '' } | ConvertTo-Json
  Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/contents/.gitkeep" -Method Put -Headers $headers -ContentType 'application/json' -Body $seed -TimeoutSec 60 | Out-Null
  Write-Host 'repo seeded with .gitkeep'
}

# 1. collect files to push (git tracked set, exclude node_modules/.git)
$files = @()
Push-Location $Root
try {
  $rel = git ls-files
  foreach ($f in $rel) {
    if ($f -match '^node_modules/|^\.git/') { continue }
    $files += $f
  }
} finally { Pop-Location }
Write-Host "files to push: $($files.Count)"

# 2. blobs
$blobShas = @{}
foreach ($f in $files) {
  $bytes = [System.IO.File]::ReadAllBytes((Join-Path $Root ($f -replace '/', '\')))
  $b64 = [Convert]::ToBase64String($bytes)
  $r = Api 'POST' "/repos/$Repo/git/blobs" @{ content = $b64; encoding = 'base64' }
  $blobShas[$f] = $r.sha
}

# 3. trees bottom-up
$treeCache = @{}
function Build-Tree([string]$dirPath) {
  if ($treeCache.ContainsKey($dirPath)) { return $treeCache[$dirPath] }
  $prefix = if ($dirPath -eq '') { '' } else { "$dirPath/" }
  $entries = @()
  foreach ($f in $files) {
    if (-not $f.StartsWith($prefix)) { continue }
    $rest = $f.Substring($prefix.Length)
    if ($rest -eq '') { continue }
    if ($rest.Contains('/')) {
      $sub = $rest.Substring(0, $rest.IndexOf('/'))
      if (-not ($entries | Where-Object { $_.path -eq $sub })) {
        $entries += @{ path = $sub; mode = '040000'; type = 'tree'; sha = $null }
      }
    } else {
      $entries += @{ path = $rest; mode = '100644'; type = 'blob'; sha = $blobShas[$f] }
    }
  }
  $out = @()
  foreach ($e in $entries) {
    if ($e.type -eq 'tree') {
      $subDir = if ($dirPath -eq '') { $e.path } else { "$dirPath/$($e.path)" }
      $e.sha = Build-Tree $subDir
    }
    $out += $e
  }
  $sorted = $out | Sort-Object @{ Expression = { if ($_.type -eq 'tree') { "$($_.path)/" } else { $_.path } } }
  $r = Api 'POST' "/repos/$Repo/git/trees" @{ tree = $sorted }
  $treeCache[$dirPath] = $r.sha
  return $r.sha
}

$rootTree = Build-Tree ''

# 4. commit
$now = (Get-Date).ToString('yyyy-MM-ddTHH:mm:ssZ')
$commit = Api 'POST' "/repos/$Repo/git/commits" @{
  message = 'feat: initial release'
  tree = $rootTree
  parents = @()
  author = @{ name = 'luoliang'; email = 'liangluor@isoftstone.com'; date = $now }
  committer = @{ name = 'luoliang'; email = 'liangluor@isoftstone.com'; date = $now }
}
Write-Host "commit -> $($commit.sha.Substring(0,7))"

# 5. ref
try {
  $ref = Api 'POST' "/repos/$Repo/git/refs" @{ ref = 'refs/heads/main'; sha = $commit.sha }
  Write-Host "ref created: $($ref.ref)"
} catch {
  $ref = Api 'PATCH' "/repos/$Repo/git/refs/heads/main" @{ sha = $commit.sha; force = $true }
  Write-Host "ref updated (force): $($ref.ref)"
}

# 6. verify
$repoInfo = Api 'GET' "/repos/$Repo"
Write-Host "default_branch: $($repoInfo.default_branch), private: $($repoInfo.private)"
$treeUri = "https://api.github.com/repos/$Repo/git/trees/$rootTree"
$treeInfo = Invoke-RestMethod -Uri ($treeUri + '?recursive=1') -Method GET -Headers $headers -TimeoutSec 60
Write-Host "tree entries: $($treeInfo.tree.Count)"
Write-Host "OK"
