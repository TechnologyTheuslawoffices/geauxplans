$content = Get-Content 'C:\Users\Arman\Documents\GeauxDrafterPrivate\templates\ClientFPOA_extracted\word\document.xml' -Raw
$idx = $content.IndexOf('EFFECTIVE DATE')
if($idx -gt 0) {
    $start = [Math]::Max(0, $idx-200)
    $length = [Math]::Min(8000, $content.Length - $start)
    $content.Substring($start, $length)
}
