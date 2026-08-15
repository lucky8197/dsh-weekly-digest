# awesome-pr.ps1 — add a plugin entry to awesome-dsh-plugin README.md + README.zh.md (fork + PR).
param(
  [Parameter(Mandatory = $true)][string]$PluginName,  # e.g. dsh-code-smell
  [Parameter(Mandatory = $true)][string]$EnDesc,
  [Parameter(Mandatory = $true)][string]$ZhDesc
)
$ErrorActionPreference = 'Stop'
$cred = "protocol=https`nhost=github.com`n`n" | git credential fill
$tok = (($cred | Select-String -Pattern '^password=').ToString()).Substring(9)
$headers = @{ 'User-Agent' = 'dsh-plugin-publish'; 'Authorization' = "token $tok" }
$fork = 'lucky8197/awesome-dsh-plugin'
$upstream = 'awesome-dsh-plugin/awesome-dsh-plugin'

function Api($method, $path, $bodyObj) {
  $body = $null
  if ($null -ne $bodyObj) { $body = $bodyObj | ConvertTo-Json -Depth 12 }
  return Invoke-RestMethod -Uri "https://api.github.com$path" -Method $method -Headers $headers -ContentType 'application/json' -Body $body -TimeoutSec 60
}

# 1. fork HEAD + branch
$head = (Api 'GET' "/repos/$fork/git/ref/heads/main").object.sha
$branch = "feat/$PluginName"
try {
  Api 'POST' "/repos/$fork/git/refs" @{ ref = "refs/heads/$branch"; sha = $head } | Out-Null
  Write-Host "branch created: $branch"
} catch { Write-Host "branch exists: $($_.Exception.Message)" }

# 2. patch both READMEs (insert after the lucky8197/dsh-doc-guard line)
function Patch-Readme([string]$file, [string]$newLine) {
  $obj = Api 'GET' "/repos/$fork/contents/$file"
  $text = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($obj.content.Replace("`n", '')))
  if ($text.Contains($newLine)) { Write-Host "$file already patched"; return }
  $marker = 'Zhenyu98/dsh-context-doctor'
  $idx = $text.IndexOf($marker)
  if ($idx -lt 0) { throw "marker not found in $file" }
  $end = $idx + $marker.Length
  $nl = $text.IndexOf("`n", $end)
  if ($nl -lt 0) { $nl = $end }
  $patched = $text.Substring(0, $nl + 1) + $newLine + "`n" + $text.Substring($nl + 1)
  $b64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($patched))
  Api 'PUT' "/repos/$fork/contents/$file" @{
    message = "docs: add $PluginName to dev/runtime category"
    content = $b64
    sha = $obj.sha
    branch = $branch
  } | Out-Null
  Write-Host "$file patched"
}

$url = "https://github.com/lucky8197/$PluginName"
$enLine = "- [lucky8197/$PluginName]($url) - $EnDesc"
$zhLine = "- [lucky8197/$PluginName]($url) - $ZhDesc"

Patch-Readme 'README.md' $enLine
try { Patch-Readme 'README.zh.md' $zhLine } catch { Write-Host "zh patch skipped: $($_.Exception.Message)" }

# 3. open PR
$pr = Api 'POST' "/repos/$upstream/pulls" @{
  title = "docs: add $PluginName to dev/runtime category"
  head = "lucky8197:$branch"
  base = 'main'
  body = "Adds [lucky8197/$PluginName]($url) - $EnDesc"
}
Write-Host "PR opened: $($pr.html_url)  state=$($pr.state)"
