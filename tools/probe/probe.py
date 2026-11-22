"""Lab-bench probe for HOCO EQ35 ANC (JieLi RCSP over BLE).
Usage: python probe.py [HEX ...]   each HEX is written to AE01 after auth; all AE02 notifications are printed."""
import asyncio
import os
import sys

from bleak import BleakClient, BleakScanner

from e1 import jl_auth

WRITE = "0000ae01-0000-1000-8000-00805f9b34fb"
NOTIFY = "0000ae02-0000-1000-8000-00805f9b34fb"


async def main(cmds):
    dev = await BleakScanner.find_device_by_filter(lambda d, a: (a.local_name or d.name or "").upper().startswith("HOCO EQ35"), timeout=15)
    if not dev:
        sys.exit("earbuds not advertising: disconnect nRF Connect on the phone, take buds out of the case")
    print("found", dev.address, dev.name)
    q: asyncio.Queue[bytes] = asyncio.Queue()
    async with BleakClient(dev) as c:
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

        for h in cmds:
            print(">>", h)
            await send(bytes.fromhex(h))
            await asyncio.sleep(1.5)
        await asyncio.sleep(2)
        while not q.empty():
            print("<<", q.get_nowait().hex(" "))


asyncio.run(main(sys.argv[1:]))
