$WScriptShell = New-Object -ComObject WScript.Shell

$RootFolder = "C:\Users\djklm\AppData\Roaming\Microsoft\Windows\Start Menu\Programs"
$ArkaiosFolder = "C:\Users\djklm\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\ARKAIOS"

if (!(Test-Path $ArkaiosFolder)) {
    New-Item -ItemType Directory -Path $ArkaiosFolder -Force
}

# 1. PuterLab Nexus IDE
$r1 = $WScriptShell.CreateShortcut("$RootFolder\PuterLab Nexus IDE.lnk")
$r1.TargetPath = "https://arkaios-puterlab-nexus-ide.vercel.app/"
$r1.Description = "PuterLab Nexus IDE con Agente IA Experto"
$r1.Save()

$s1 = $WScriptShell.CreateShortcut("$ArkaiosFolder\PuterLab Nexus IDE.lnk")
$s1.TargetPath = "https://arkaios-puterlab-nexus-ide.vercel.app/"
$s1.Description = "PuterLab Nexus IDE con Agente IA Experto"
$s1.Save()

# 2. PuterLab Deploy Hub
$r2 = $WScriptShell.CreateShortcut("$RootFolder\PuterLab Deploy Hub.lnk")
$r2.TargetPath = "https://arkaios-puterlab-nexus-ide.vercel.app/deploy-hub"
$r2.Description = "Hub de Despliegue de Proyectos y Carga ZIP"
$r2.Save()

$s2 = $WScriptShell.CreateShortcut("$ArkaiosFolder\PuterLab Deploy Hub.lnk")
$s2.TargetPath = "https://arkaios-puterlab-nexus-ide.vercel.app/deploy-hub"
$s2.Description = "Hub de Despliegue de Proyectos y Carga ZIP"
$s2.Save()

# 3. Servidor Local
$s3 = $WScriptShell.CreateShortcut("$ArkaiosFolder\PuterLab Servidor Local.lnk")
$s3.TargetPath = "C:\ARKAIOS\Puter-Lab-Nexus-IDE-main\iniciar-servidor-local.bat"
$s3.WorkingDirectory = "C:\ARKAIOS\Puter-Lab-Nexus-IDE-main"
$s3.Description = "Iniciar Servidor HTTP Local de PuterLab en Puerto 8000"
$s3.Save()

Write-Output "Accesos directos de Windows creados exitosamente."
