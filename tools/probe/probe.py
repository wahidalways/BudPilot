"""Lab-bench probe for JieLi RCSP earbuds (HOCO EQ35 ANC) over BLE.

Usage: python probe.py [OP:DATAHEX ...]
  No args: sends the read-only set (target info, settings, sys info).
  OP:DATAHEX sends RCSP command OP (hex) with DATAHEX after the sn byte, e.g. 07:FF00007013.
Every frame from the device is printed; device commands that want a reply get an OK."""
import asyncio
import os
import sys

from bleak import BleakClient, BleakScanner

from e1 import jl_auth

WRITE = "0000ae01-0000-1000-8000-00805f9b34fb"
NOTIFY = "0000ae02-0000-1000-8000-00805f9b34fb"
# firmware update, flash, file ops, connection reset, custom/factory reset: never sent
NEVER = {0x06, 0x0B, 0x1A, 0xD6, 0xF0, 0xFF, *range(0x1B, 0x29), *range(0xE1, 0xEA)}
READS = ["03:FFFFFFFF00", "C1:FFFFFFFF", "07:FF00007013"]  # 0x7013 = attrs 0,1,4,12,13,14


def frame(flags, op, payload):
    return bytes([0xFE, 0xDC, 0xBA, flags, op, len(payload) >> 8, len(payload) & 0xFF]) + payload + b"\xEF"


def pop_frames(buf: bytearray):
    out = []
    while True:
        i = buf.find(b"\xFE\xDC\xBA")
        if i < 0:
            del buf[: max(0, len(buf) - 2)]  # keep a possibly split prefix
            return out
        del buf[:i]
        if len(buf) < 7:
            return out
        end = 8 + ((buf[5] << 8) | buf[6])
        if len(buf) < end:
            return out
        f = bytes(buf[:end])
        del buf[:end]
        if f[-1] != 0xEF:
            print("!! bad end byte", f.hex(" "))
            continue
        out.append(f)


def tlvs(b):
    out, i = [], 0
    while i < len(b):
        n = b[i]
        if n == 0 or i + 1 + n > len(b):
            out.append(("rest", b[i:].hex(" ")))
            break
        out.append((b[i + 1], b[i + 2 : i + 1 + n].hex(" ")))
        i += 1 + n
    return out


def show(f):
    flags, op, p = f[3], f[4], f[7:-1]
    is_cmd = bool(flags & 0x80)
    if is_cmd:
        sn, data = p[0], p[1:]
        print(f"<< CMD  op={op:02X} flags={flags:02X} sn={sn} data={data.hex(' ')}")
    else:
        status, sn, data = p[0], p[1], p[2:]
        print(f"<< RESP op={op:02X} status={status} sn={sn} data={data.hex(' ')}")
    body = data[1:] if op in (0x07, 0x08, 0x09) and data[:1] == b"\xFF" else data if op in (0x03, 0xC1) else None
    if body:
        for t, v in tlvs(body):
            print(f"     tlv {t}: {v}")
    return is_cmd and flags & 0x40, op, sn


async def main(cmds):
    dev = await BleakScanner.find_device_by_filter(lambda d, a: (a.local_name or d.name or "").upper().startswith("HOCO EQ35"), timeout=15)
    if not dev:
        sys.exit("earbuds not advertising: disconnect nRF Connect on the phone, take buds out of the case")
    print("found", dev.address, dev.name)
    q: asyncio.Queue[bytes] = asyncio.Queue()
    async with BleakClient(dev) as c:
        print("mtu", c.mtu_size)
        await c.start_notify(NOTIFY, lambda _, d: q.put_nowait(bytes(d)))
        send = lambda b: c.write_gatt_char(WRITE, b, response=False)
        recv = lambda: asyncio.wait_for(q.get(), 5)

        # 1) we challenge the device
        rand = os.urandom(16)
        await send(b"\x00" + rand)
        r = await recv()
        assert r == b"\x01" + jl_auth(rand), f"device auth failed: {r.hex()}"
        await send(b"\x02pass")
        # 2) device challenges us
        r = await recv()
        assert r[:1] == b"\x00" and len(r) == 17, f"unexpected: {r.hex()}"
        await send(b"\x01" + jl_auth(r[1:]))
        r = await recv()
        assert r == b"\x02pass", f"we failed auth: {r.hex()}"
        print("auth ok")

        buf = bytearray()

        async def reader():
            while True:
                buf.extend(await q.get())
                for f in pop_frames(buf):
                    wants_reply, op, sn = show(f)
                    if wants_reply:
                        await send(frame(0x00, op, bytes([0, sn])))

        task = asyncio.create_task(reader())
        for sn, arg in enumerate(cmds or READS):
            op, _, data = arg.partition(":")
            op = int(op, 16)
            if op in NEVER:
                sys.exit(f"refusing opcode {op:02X}")
            pkt = frame(0xC0, op, bytes([sn]) + bytes.fromhex(data))
            print(">>", pkt.hex(" "))
            await send(pkt)
            await asyncio.sleep(1.5)
        await asyncio.sleep(3)
        task.cancel()


asyncio.run(main(sys.argv[1:]))
