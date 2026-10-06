const { execFile } = require('node:child_process');
const path = require('node:path');
const { pasteFiles } = require('./paste-files.cjs');
function windowsClipboard(operation, files = [], destination = null) {
  if (process.platform !== 'win32') return Promise.reject(Error('Pegar archivos está disponible en Windows. Puedes copiar sus rutas en este sistema.'));
  // File names travel as JSON on stdin, never as executable PowerShell source.
  const code = `$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Windows.Forms
${operation === 'paste' ? `$request = ConvertFrom-Json ([Console]::In.ReadToEnd())
$shell = New-Object -ComObject Shell.Application
$folder = $null
if ($request.folder) { $folder = $shell.NameSpace([string]$request.folder) }
elseif ($request.handle) {
 foreach ($window in @($shell.Windows())) {
  if ([string]$window.HWND -eq [string]$request.handle) {
   try { $candidate = $window.Document.Folder; if (Test-Path -LiteralPath $candidate.Self.Path -PathType Container) { $folder = $candidate } } catch {}
   break
  }
 }
}
if ($null -eq $folder) { [Console]::WriteLine('null') }
else { ConvertTo-Json -Compress -InputObject ([string]$folder.Self.Path) }
` : operation === 'read' ? `ConvertTo-Json -Compress -InputObject @([Windows.Forms.Clipboard]::GetFileDropList())` : `$paths = ConvertFrom-Json ([Console]::In.ReadToEnd())
$list = New-Object System.Collections.Specialized.StringCollection
foreach ($file in $paths) { [void]$list.Add([string]$file) }
$data = New-Object Windows.Forms.DataObject
$data.SetFileDropList($list)
$effect = New-Object IO.MemoryStream
$effect.Write([byte[]](1,0,0,0), 0, 4)
$effect.Position = 0
$data.SetData('Preferred DropEffect', $effect)
[Windows.Forms.Clipboard]::SetDataObject($data, $true, 10, 100)`}`;
  return new Promise((resolve, reject) => {
    const exe = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const child = execFile(exe, ['-NoLogo', '-NoProfile', '-NonInteractive', '-STA', '-EncodedCommand', Buffer.from(code, 'utf16le').toString('base64')], { windowsHide: true, timeout: 15000, maxBuffer: 1024 * 1024, encoding: 'utf8' }, (error, stdout) => {
      if (error) return reject(Error('No se pudo acceder al portapapeles de archivos. Inténtalo de nuevo.'));
      try { resolve(operation === 'read' || operation === 'paste' ? JSON.parse(stdout.trim() || '[]') : undefined); } catch { reject(Error('Lista de archivos no válida.')); }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify(operation === 'paste' ? { files, ...destination } : files));
  });
}
module.exports = {
  readFiles: () => windowsClipboard('read'), writeFiles: files => windowsClipboard('write', files),
  async pasteFiles(files, destination) {
    const folder = destination.folder || await windowsClipboard('paste', [], destination);
    if (!folder) return false;
    return pasteFiles(files, folder);
  }
};
