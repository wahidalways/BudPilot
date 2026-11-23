// Builds desktop/helper/shono-helper.exe from helper.cs with the C# compiler in Windows' .NET Framework (every
// Windows 10/11 has it), so building Shono needs nothing new. Skips the work when the exe is newer than the source.
import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL(".", import.meta.url));
export const HELPER = `${dir}shono-helper.exe`;

export function compileHelper() {
  const src = `${dir}helper.cs`;
  if (existsSync(HELPER) && statSync(HELPER).mtimeMs > statSync(src).mtimeMs) return HELPER;
  const net = `${process.env.WINDIR}\\Microsoft.NET\\Framework64\\v4.0.30319`;
  const winmd = `${process.env.WINDIR}\\System32\\WinMetadata`;
  const refs = [
    `${winmd}\\Windows.Media.winmd`,
    `${winmd}\\Windows.Foundation.winmd`,
    `${net}\\System.Runtime.dll`,
    `${net}\\System.Runtime.InteropServices.WindowsRuntime.dll`, // WinRT events
  ];
  execFileSync(`${net}\\csc.exe`, ["/nologo", "/optimize+", "/target:exe", `/out:${HELPER}`, ...refs.map((r) => `/r:${r}`), src], { stdio: "inherit" });
  return HELPER;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(compileHelper());
