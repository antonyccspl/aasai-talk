param([Parameter(Mandatory=$true)][string]$ApiKey)
$ErrorActionPreference = 'Stop'
$base = 'https://vnpxbqcemqcsyxbunqvf.supabase.co'
$headers = @{ apikey = $ApiKey; Prefer = 'count=exact' }
$schema = Get-Content -Raw -LiteralPath "$PSScriptRoot/../supabase-api-schema.audit.json" | ConvertFrom-Json
$results = foreach ($table in $schema.definitions.PSObject.Properties.Name) {
  try {
    $response = Invoke-WebRequest -Uri "$base/rest/v1/${table}?select=*&limit=0" -Headers $headers -UserAgent 'AasaiSchemaAudit/1.0'
    [pscustomobject]@{ table=$table; status=[int]$response.StatusCode; range=[string]$response.Headers['Content-Range']; columns=@($schema.definitions.$table.properties.PSObject.Properties.Name) }
  } catch { [pscustomobject]@{ table=$table; status=[int]$_.Exception.Response.StatusCode; error='Read unavailable' } }
}
$results | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath "$PSScriptRoot/../supabase-table-inventory.audit.json"
$results | Select-Object table,status,range | Format-Table -AutoSize
