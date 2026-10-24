<#
.SYNOPSIS
  Roda dados/consultas.sql no SQL Warehouse (Databricks CLI autenticada) e grava dados/olist_city.json
  no formato { geradoEm, <bloco>: [linhas] }, com números já convertidos.
.EXAMPLE
  .\olist-city\scripts\exportar_dados.ps1
#>
param([string]$Sql = "$HOME\.claude\skills\verificar-dados-lakehouse\scripts\sql.ps1")
$ErrorActionPreference = "Stop"
$raiz = Split-Path $PSScriptRoot -Parent
$inv = [Globalization.CultureInfo]::InvariantCulture

$res = & $Sql -QueryFile (Join-Path $raiz "dados\consultas.sql") -Json | ConvertFrom-Json
$saida = [ordered]@{ geradoEm = (Get-Date -Format "yyyy-MM-dd") }
foreach ($b in $res) {
    if ($b.erro) { throw "Bloco $($b.nome): $($b.erro)" }
    $saida[$b.nome] = @(foreach ($l in $b.linhas) {
        $o = [ordered]@{}
        foreach ($p in $l.PSObject.Properties) {
            $n = 0.0
            $o[$p.Name] = if ($p.Value -is [string] -and [double]::TryParse($p.Value, [Globalization.NumberStyles]::Float, $inv, [ref]$n)) { $n } else { $p.Value }
        }
        $o
    })
}
$destino = Join-Path $raiz "dados\olist_city.json"
$saida | ConvertTo-Json -Depth 5 -Compress | Set-Content $destino -Encoding utf8
"ok: $destino ($((Get-Item $destino).Length) bytes)"
