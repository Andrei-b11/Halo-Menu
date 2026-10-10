const { spawn } = require('node:child_process');
const path = require('node:path');

// Tracks window handles only, never window titles or typed content.
function createPasteFocus(windows) {
  if (process.platform !== 'win32') return null;
  const handles = windows.map(win => { const b = win.getNativeWindowHandle(); return b.length === 8 ? b.readBigUInt64LE().toString() : String(b.readUInt32LE()); });
  const code = `$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class HaloFocus {
 public static System.Threading.Tasks.Task<string> Next() { return System.Threading.Tasks.Task.Run(() => Console.ReadLine()); }
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
 [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int k);
 [StructLayout(LayoutKind.Sequential)] public struct Point { public int x,y; }
 [DllImport("user32.dll")] public static extern bool GetCursorPos(out Point p);
 [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(Point p);
 [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h, uint flags);
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr h, System.Text.StringBuilder name, int size);
 [StructLayout(LayoutKind.Sequential)] public struct Keyboard { public ushort key, scan; public uint flags, time; public UIntPtr extra; }
 [StructLayout(LayoutKind.Sequential)] public struct Mouse { public int x,y; public uint data,flags,time; public UIntPtr extra; }
 [StructLayout(LayoutKind.Explicit)] public struct Union { [FieldOffset(0)] public Keyboard keyboard; [FieldOffset(0)] public Mouse mouse; }
 [StructLayout(LayoutKind.Sequential)] public struct Input { public uint type; public Union data; }
 [DllImport("user32.dll", SetLastError=true)] static extern uint SendInput(uint n, Input[] inputs, int size);
 public static bool Paste() {
  var keys = new ushort[] { 0x11, 0x56, 0x56, 0x11 }; var inputs = new Input[4];
  for (int i=0; i<4; i++) { inputs[i].type=1; inputs[i].data.keyboard.key=keys[i]; inputs[i].data.keyboard.flags=i>=2 ? 2u : 0u; }
  return SendInput(4, inputs, Marshal.SizeOf(typeof(Input)))==4;
 }
}
'@
Add-Type -AssemblyName System.Windows.Forms
$shellApp = New-Object -ComObject Shell.Application
function Reply($job, $value) { $json = ConvertTo-Json -Compress -Depth 3 -InputObject $value; [Console]::WriteLine('json ' + $job + ' ' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes([string]$json))) }
function ExplorerWindow($handle) { foreach ($w in @($shellApp.Windows())) { try { if ([string]$w.HWND -eq [string]$handle) { return $w } } catch {} }; return $null }
$excluded = @(${handles.join(',')})
$last = ''; $line = [HaloFocus]::Next()
while ($true) {
 $h = [HaloFocus]::GetForegroundWindow(); [uint32]$owner = 0
 [void][HaloFocus]::GetWindowThreadProcessId($h, [ref]$owner)
 if ($h.ToInt64() -ne 0 -and $excluded -notcontains $h.ToInt64()) {
  $value = 'focus ' + $h.ToInt64() + ' ' + $owner
  if ($value -ne $last) { [Console]::WriteLine($value); $last = $value }
 }
 if ($line.Wait(50)) {
  $command = $line.Result; if ($null -eq $command) { break }
  if ($command -match '^capture (\\d+)$') {
   $job = $Matches[1]; $now = [HaloFocus]::GetForegroundWindow(); [uint32]$owner = 0
   [void][HaloFocus]::GetWindowThreadProcessId($now, [ref]$owner)
   if ($now.ToInt64() -ne 0 -and $excluded -notcontains $now.ToInt64()) { $last = 'focus ' + $now.ToInt64() + ' ' + $owner }
   $point=New-Object HaloFocus+Point; [void][HaloFocus]::GetCursorPos([ref]$point)
   $under=[HaloFocus]::GetAncestor([HaloFocus]::WindowFromPoint($point),2); [uint32]$mouseOwner=0
   [void][HaloFocus]::GetWindowThreadProcessId($under,[ref]$mouseOwner)
   $class=New-Object Text.StringBuilder 256; [void][HaloFocus]::GetClassName($under,$class,256)
   $desktop = [int]($class.ToString() -eq 'Progman' -or $class.ToString() -eq 'WorkerW')
   if ($excluded -contains $under.ToInt64()) { $under=[IntPtr]::Zero }
   $focusValue = if ($last) { $last.Replace('focus ', '') } else { '0 0' }
   [Console]::WriteLine('target ' + $job + ' ' + $focusValue + ' ' + $under.ToInt64() + ' ' + $mouseOwner + ' ' + $desktop)
  }
  if ($command -match '^(restore|paste) (\\d+) (\\d+) (\\d+)$') {
   $operation = $Matches[1]; $job = $Matches[2]; $target = [IntPtr]([long]$Matches[3]); $expected = [uint32]$Matches[4]
   [uint32]$actual = 0; [void][HaloFocus]::GetWindowThreadProcessId($target, [ref]$actual)
   $ok = [HaloFocus]::IsWindow($target) -and $actual -eq $expected
   if ($ok) {
    [void][HaloFocus]::SetForegroundWindow($target)
    for ($i=0; $i -lt 30; $i++) {
     $held = $false
     foreach ($k in @(16,17,18,91,92)) { if ([HaloFocus]::GetAsyncKeyState($k) -lt 0) { $held = $true } }
     if ([HaloFocus]::GetForegroundWindow() -eq $target -and !$held) { break }
     Start-Sleep -Milliseconds 50
    }
    $ok = [HaloFocus]::GetForegroundWindow() -eq $target -and !$held
    if ($ok -and $operation -eq 'paste') { $ok = [HaloFocus]::Paste() }
   }
   [Console]::WriteLine('done ' + $job + ' ' + [int]$ok)
  }
  if ($command -match '^(files-read|files-write|folder|selection) (\\d+) ?(.*)$') {
   $op = $Matches[1]; $job = $Matches[2]; $arg = $Matches[3]
   try {
    if ($op -eq 'files-read') { Reply $job @([Windows.Forms.Clipboard]::GetFileDropList()) }
    elseif ($op -eq 'files-write') {
     $paths = ConvertFrom-Json ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($arg)))
     $list = New-Object System.Collections.Specialized.StringCollection
     foreach ($file in @($paths)) { [void]$list.Add([string]$file) }
     $data = New-Object Windows.Forms.DataObject; $data.SetFileDropList($list)
     $effect = New-Object IO.MemoryStream; $effect.Write([byte[]](1,0,0,0), 0, 4); $effect.Position = 0
     $data.SetData('Preferred DropEffect', $effect)
     [Windows.Forms.Clipboard]::SetDataObject($data, $true, 10, 100); Reply $job $true
    }
    else {
     $w = ExplorerWindow $arg; $result = $null
     if ($null -ne $w) {
      if ($op -eq 'folder') { $p = [string]$w.Document.Folder.Self.Path; if (Test-Path -LiteralPath $p -PathType Container) { $result = $p } }
      else { $result = @(@($w.Document.SelectedItems()) | ForEach-Object { [string]$_.Path } | Where-Object { $_ -and (Test-Path -LiteralPath $_) }) }
     }
     if ($op -eq 'selection' -and $null -eq $result) { $result = @() }
     Reply $job $result
    }
   } catch { [Console]::WriteLine('json ' + $job + ' !') }
  }
  $line = [HaloFocus]::Next()
 }
}`;
  const exe = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const child = spawn(exe, ['-NoLogo', '-NoProfile', '-NonInteractive', '-STA', '-EncodedCommand', Buffer.from(code, 'utf16le').toString('base64')], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let current = null, buffer = '', sequence = 0, dead = false;
  const jobs = new Map();
  const fail = () => { dead = true; current = null; for (const job of jobs.values()) { clearTimeout(job.timer); job.resolve(job.reject ? null : false); } jobs.clear(); };
  child.on('error', fail); child.on('exit', fail); child.stdin.on('error', fail); child.stderr.resume();
  child.stdout.on('data', data => {
    buffer += data.toString(); const lines = buffer.split(/\r?\n/); buffer = lines.pop();
    for (const line of lines) {
      const [op, a, b] = line.split(' ');
      if (op === 'focus' && /^\d+$/.test(a) && /^\d+$/.test(b)) current = { handle: a, pid: b };
      if (op === 'json' && jobs.has(a)) {
        const job = jobs.get(a); jobs.delete(a); clearTimeout(job.timer);
        if (b === '!' || b === undefined) job.reject(Error('Windows no respondió a tiempo. Inténtalo de nuevo.'));
        else { try { job.resolve(JSON.parse(Buffer.from(b, 'base64').toString('utf8') || 'null')); } catch { job.reject(Error('Respuesta de Windows no válida.')); } }
      }
      if (op === 'done' && jobs.has(a)) { const job = jobs.get(a); jobs.delete(a); clearTimeout(job.timer); job.resolve(b === '1'); }
      if (op === 'target' && jobs.has(a)) {
        const job = jobs.get(a); jobs.delete(a); clearTimeout(job.timer);
        const [, , handle, pid, mouseHandle, mousePid, desktop] = line.split(' ');
        job.resolve({ handle, pid, pointer: mouseHandle && mouseHandle !== '0' ? { handle: mouseHandle, pid: mousePid, desktop: desktop === '1' } : null });
      }
    }
  });
  return {
    get current() { return current; },
    capture() {
      if (dead) return Promise.resolve(null);
      return new Promise(resolve => {
        const id = String(++sequence), timer = setTimeout(() => { jobs.delete(id); resolve(null); }, 3000);
        jobs.set(id, { resolve, timer }); child.stdin.write(`capture ${id}\n`);
      });
    },
    restore(target, paste = false) {
      if (dead || !target) return Promise.resolve(false);
      return new Promise(resolve => {
        const id = String(++sequence), timer = setTimeout(() => { jobs.delete(id); resolve(false); }, 2500);
        jobs.set(id, { resolve, timer }); child.stdin.write(`${paste ? 'paste' : 'restore'} ${id} ${target.handle} ${target.pid}\n`);
      });
    },
    // Lo que antes necesitaba abrir PowerShell cada vez (≈ medio segundo) se pide a este
    // proceso, que ya está abierto: leer y escribir archivos en el portapapeles, la carpeta de
    // una ventana del Explorador y lo que está seleccionado en ella.
    get alive() { return !dead; },
    request(op, arg = '') {
      if (dead) return Promise.reject(Error('El ayudante de Windows no está disponible.'));
      return new Promise((resolve, reject) => {
        const id = String(++sequence), timer = setTimeout(() => { jobs.delete(id); reject(Error('Windows no respondió a tiempo. Inténtalo de nuevo.')); }, 8000);
        jobs.set(id, { resolve, reject, timer }); child.stdin.write(`${op} ${id}${arg ? ' ' + arg : ''}
`);
      });
    },
    close() { child.kill(); fail(); }
  };
}
module.exports = { createPasteFocus };
