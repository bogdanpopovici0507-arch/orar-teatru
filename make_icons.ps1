Add-Type -AssemblyName System.Drawing

function Generate-PwaIcon($size, $filename) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
    $rect = New-Object System.Drawing.Rectangle 0, 0, $size, $size
    $color1 = [System.Drawing.ColorTranslator]::FromHtml('#8b1e3f')
    $color2 = [System.Drawing.ColorTranslator]::FromHtml('#4a0e1e')
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, $color1, $color2, 45.0
    $g.FillRectangle($brush, $rect)
    
    $circleBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(40, 255, 255, 255))
    $g.FillEllipse($circleBrush, [int]($size * 0.1), [int]($size * 0.1), [int]($size * 0.8), [int]($size * 0.8))

    $fontFamily = New-Object System.Drawing.FontFamily('Segoe UI Emoji')
    if (-not $fontFamily) { $fontFamily = [System.Drawing.FontFamily]::GenericSansSerif }
    $font = [System.Drawing.Font]::new($fontFamily, [float]($size * 0.42), [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
    $textBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    $g.DrawString([char]::ConvertFromUtf32(0x1F3AD), $font, $textBrush, [System.Drawing.RectangleF]::new(0, 0, $size, $size), $sf)
    
    $bmp.Save($filename, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
}

Generate-PwaIcon 192 'C:\Users\Laptop\.gemini\antigravity\scratch\orar-teatru\public\icon-192.png'
Generate-PwaIcon 512 'C:\Users\Laptop\.gemini\antigravity\scratch\orar-teatru\public\icon-512.png'
Write-Host "Icons generated successfully"
