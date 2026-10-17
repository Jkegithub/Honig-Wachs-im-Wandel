# Baut index.html aus src/template.html + src/js/*.js + fonts/*.woff2 (+ optional src/acceptance.json)
# Ergebnis: eine einzige HTML-Datei, alles inline, keine externen Dateien.
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$utf8 = [Text.UTF8Encoding]::new($false)
$tpl  = [IO.File]::ReadAllText("$root\src\template.html", $utf8)
$js   = (Get-ChildItem "$root\src\js\*.js" | Sort-Object Name | ForEach-Object {
          "// ===== $($_.Name) =====`n" + [IO.File]::ReadAllText($_.FullName, $utf8) }) -join "`n"
$acc  = if (Test-Path "$root\src\acceptance.json") { [IO.File]::ReadAllText("$root\src\acceptance.json", $utf8).Trim() } else { 'null' }
$fr   = [Convert]::ToBase64String([IO.File]::ReadAllBytes("$root\fonts\Fraunces-600.woff2"))
$scp  = [Convert]::ToBase64String([IO.File]::ReadAllBytes("$root\fonts\SourceCodePro-Regular.woff2"))
$out  = $tpl.Replace('@@SCRIPT@@', $js).Replace('@@ACCEPTANCE@@', $acc).Replace('@@FONT_FRAUNCES@@', $fr).Replace('@@FONT_SCP@@', $scp)
if ($out -match '@@[A-Z_]+@@') { throw "Platzhalter nicht ersetzt: $($Matches[0])" }
[IO.File]::WriteAllText("$root\index.html", $out, $utf8)
$f = Get-Item "$root\index.html"
"index.html: {0:N0} Bytes, {1} Zeilen" -f $f.Length, ($out -split "`n").Count
