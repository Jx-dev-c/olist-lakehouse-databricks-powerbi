# Envia os CSVs do Olist para o volume de landing usando a Databricks CLI.
# Uso: .\scripts\upload_dados.ps1 -Pasta "C:\caminho\para\csvs" [-Catalog workspace]
param(
    [Parameter(Mandatory = $true)][string]$Pasta,
    [string]$Catalog = "workspace"
)

$destino = "dbfs:/Volumes/$Catalog/olist_bronze/landing"

Get-ChildItem -Path $Pasta -Filter *.csv | ForEach-Object {
    Write-Host "Enviando $($_.Name)..."
    databricks fs cp $_.FullName "$destino/$($_.Name)" --overwrite
    if ($LASTEXITCODE -ne 0) { throw "Falha ao enviar $($_.Name)" }
}

Write-Host "Concluído. Arquivos em ${destino}:"
databricks fs ls $destino
