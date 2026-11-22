"""Polls the earbuds every few seconds and prints what changed: EQ, touch keys, noise mode, Hoco's status push.
Each read connects only briefly, so the maker's app can use the earbuds in between.
Usage: python watch.py [minutes]   (read-only: sends only get-settings and get-sys-info)"""
import asyncio
import sys
import time

from bleak import BleakClient, BleakScanner

from probe import NOTIFY, WRITE, authenticate, frame, is_hoco_eq35, pop_frames, tlvs


def now():
    return time.strftime("%H:%M:%S")


async def snapshot():
    dev = await BleakScanner.find_device_by_filter(is_hoco_eq35, timeout=4)
    if not dev:
        return None  # not advertising: another app holds the link
    q: asyncio.Queue[bytes] = asyncio.Queue()
    async with BleakClient(dev, timeout=10) as c:
        await c.start_notify(NOTIFY, lambda _, d: q.put_nowait(bytes(d)))
        send = lambda b: c.write_gatt_char(WRITE, b, response=False)
        await authenticate(send, lambda: asyncio.wait_for(q.get(), 5))
        await send(frame(0xC0, 0xC1, bytes.fromhex("00FFFFFFFF")))  # all settings
        await send(frame(0xC0, 0x07, bytes.fromhex("01FF0000A010")))  # attrs 4 EQ, 13 noise, 15
        out, buf, end = {}, bytearray(), time.monotonic() + 2.5
        while (left := end - time.monotonic()) > 0:
            try:
                buf.extend(await asyncio.wait_for(q.get(), left))
            except asyncio.TimeoutError:
                break
            for f in pop_frames(buf):
                flags, op, p = f[3], f[4], f[7:-1]
                if flags & 0x80:  # pushed by the earbuds
                    if op == 0xFF:
                        out["hoco push"] = p[1:].hex(" ")
                    if flags & 0x40:
                        await send(frame(0, op, bytes([0, p[0]])))
                elif op == 0xC1:
                    out["keys"] = dict(tlvs(p[2:])).get(2)
                elif op == 0x07:
                    t = dict(tlvs(p[3:]))  # skip status, sn, FF
                    out["eq"], out["noise"], out["attr15"] = t.get(4), t.get(13), t.get(15)
        return out


async def main(minutes):
    last: dict = {}
    stop = time.monotonic() + minutes * 60
    print(now(), f"watching for {minutes} min")
    while time.monotonic() < stop:
        try:
            snap = await snapshot()
        except Exception as e:  # dropped mid-read when the other app connects; try again next round
            snap = None
            print(now(), "read interrupted:", type(e).__name__)
        for k, v in (snap or {}).items():
            if last.get(k) != v:
                print(f"{now()} {k}: {v}")
                last[k] = v
        await asyncio.sleep(4)


if __name__ == "__main__":
    asyncio.run(main(float(sys.argv[1]) if len(sys.argv) > 1 else 10))
