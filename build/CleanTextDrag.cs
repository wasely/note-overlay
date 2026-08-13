using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

internal static class CleanTextDrag
{
    [StructLayout(LayoutKind.Sequential)]
    private struct Point { public int X; public int Y; }

    [StructLayout(LayoutKind.Sequential)]
    private struct Input
    {
        public uint Type;
        public InputUnion Data;
    }

    [StructLayout(LayoutKind.Explicit)]
    private struct InputUnion
    {
        [FieldOffset(0)] public KeyboardInput Keyboard;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct KeyboardInput
    {
        public ushort VirtualKey;
        public ushort ScanCode;
        public uint Flags;
        public uint Time;
        public UIntPtr ExtraInfo;
    }

    [DllImport("user32.dll")]
    private static extern short GetAsyncKeyState(int virtualKey);

    [DllImport("user32.dll")]
    private static extern bool GetCursorPos(out Point point);

    [DllImport("user32.dll")]
    private static extern IntPtr WindowFromPoint(Point point);

    [DllImport("user32.dll")]
    private static extern IntPtr GetAncestor(IntPtr windowHandle, uint flags);

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr windowHandle);

    [DllImport("user32.dll")]
    private static extern uint SendInput(uint count, Input[] inputs, int size);

    [DllImport("user32.dll")]
    private static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extraInfo);

    private const uint GaRoot = 2;
    private const uint Keyboard = 1;
    private const uint KeyUp = 0x0002;
    private const uint Unicode = 0x0004;
    private const uint MouseDown = 0x0002;
    private const uint MouseUp = 0x0004;

    private static void Log(string message)
    {
        var path = Environment.GetEnvironmentVariable("NOTEBOOK_CLEAN_DRAG_LOG");
        if (!string.IsNullOrEmpty(path)) File.AppendAllText(path, DateTime.UtcNow.ToString("O") + " " + message + Environment.NewLine);
    }

    private static bool WaitForDrop()
    {
        var signal = Environment.GetEnvironmentVariable("NOTEBOOK_CLEAN_DRAG_DROP_SIGNAL");
        if (!string.IsNullOrEmpty(signal))
        {
            var signalDeadline = DateTime.UtcNow.AddSeconds(10);
            while (!File.Exists(signal) && DateTime.UtcNow < signalDeadline) Thread.Sleep(10);
            return File.Exists(signal);
        }

        var pressDeadline = DateTime.UtcNow.AddSeconds(2);
        while ((GetAsyncKeyState(0x01) & 0x8000) == 0 && DateTime.UtcNow < pressDeadline) Thread.Sleep(5);
        if ((GetAsyncKeyState(0x01) & 0x8000) == 0) return false;
        var releaseDeadline = DateTime.UtcNow.AddSeconds(15);
        while ((GetAsyncKeyState(0x01) & 0x8000) != 0 && DateTime.UtcNow < releaseDeadline) Thread.Sleep(8);
        return (GetAsyncKeyState(0x01) & 0x8000) == 0;
    }

    private static uint TypeUnicode(string text)
    {
        var inputs = new Input[text.Length * 2];
        for (var index = 0; index < text.Length; index++)
        {
            inputs[index * 2] = new Input { Type = Keyboard, Data = new InputUnion { Keyboard = new KeyboardInput { ScanCode = text[index], Flags = Unicode } } };
            inputs[index * 2 + 1] = new Input { Type = Keyboard, Data = new InputUnion { Keyboard = new KeyboardInput { ScanCode = text[index], Flags = Unicode | KeyUp } } };
        }
        return SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(Input)));
    }

    [STAThread]
    private static int Main(string[] args)
    {
        if (args.Length == 2 && args[0] == "--probe") { Console.WriteLine(args[1]); return 0; }
        if (args.Length != 1 || string.IsNullOrWhiteSpace(args[0])) return 2;

        Log("started " + args[0]);
        if (!WaitForDrop()) { Log("drop-timeout"); return 3; }

        Point point;
        if (!GetCursorPos(out point)) return 4;
        var target = WindowFromPoint(point);
        var root = GetAncestor(target, GaRoot);
        Log("target=" + target + " root=" + root + " point=" + point.X + "," + point.Y);
        if (root == IntPtr.Zero || !SetForegroundWindow(root)) { Log("focus-failed"); return 5; }

        Thread.Sleep(140);
        mouse_event(MouseDown, 0, 0, 0, UIntPtr.Zero);
        mouse_event(MouseUp, 0, 0, 0, UIntPtr.Zero);
        Thread.Sleep(100);
        var sent = TypeUnicode(args[0]);
        Log("sent=" + sent);
        return sent == args[0].Length * 2 ? 0 : 6;
    }
}
