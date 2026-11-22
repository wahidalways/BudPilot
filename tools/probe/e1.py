"""JieLi RCSP auth: Bluetooth legacy E1 (SAFER+) with JieLi's fixed key/address.
Verified against a real HOCO EQ35 ANC challenge/response."""

EXP = [pow(45, i, 257) % 256 for i in range(256)]  # 45^128 = 256 -> 0
LOG = [0] * 256
for _i, _v in enumerate(EXP):
    LOG[_v] = _i
XP = {0, 3, 4, 7, 8, 11, 12, 15}  # byte positions that XOR (others add)
PERM = [8, 11, 12, 15, 2, 1, 6, 5, 10, 9, 14, 13, 0, 7, 4, 3]  # Armenian shuffle
OFFSET = [233, 229, 223, 193, 179, 167, 149, 131]

JL_KEY = bytes.fromhex("06775f87918dd423005df1d8cf0c142b")
JL_ADDR = bytes.fromhex("112233332211")


def _mix(x, k, xor_first):
    return [((a ^ b) if (i in XP) == xor_first else (a + b) % 256) for i, (a, b) in enumerate(zip(x, k))]


def _subkeys(key):
    reg = list(key) + [0]
    for b in key:
        reg[16] ^= b
    ks = [list(key)]
    for p in range(2, 18):
        reg = [((b << 3) | (b >> 5)) & 0xFF for b in reg]
        ks.append([(reg[(p - 1 + i) % 17] + EXP[EXP[(17 * p + i + 1) % 256]]) % 256 for i in range(16)])
    return ks


def _ar(key, x, prime):
    ks = _subkeys(key)
    orig, x = list(x), list(x)
    for r in range(8):
        if prime and r == 2:  # A'r: round-1 input folded into round-3 input
            x = _mix(x, orig, True)
        x = _mix(x, ks[2 * r], True)
        x = [EXP[b] if i in XP else LOG[b] for i, b in enumerate(x)]
        x = _mix(x, ks[2 * r + 1], False)
        for lvl in range(4):
            for j in range(0, 16, 2):
                a, b = x[j], x[j + 1]
                x[j], x[j + 1] = (2 * a + b) % 256, (a + b) % 256
            if lvl < 3:
                x = [x[PERM[i]] for i in range(16)]
    return _mix(x, ks[16], True)


def e1(key, rand, addr):
    a = _ar(key, rand, False)
    y = [((a[i] ^ rand[i]) + addr[i % len(addr)]) % 256 for i in range(16)]
    kt = [(b + OFFSET[i % 8]) % 256 if (i < 8) == (i % 2 == 0) else b ^ OFFSET[i % 8] for i, b in enumerate(key)]
    return bytes(_ar(kt, y, True))


def jl_auth(challenge: bytes) -> bytes:
    return e1(JL_KEY, challenge, JL_ADDR)


if __name__ == "__main__":
    got = jl_auth(bytes.fromhex("ABB2CDC69BB454110E827441213DDC87"))
    assert got == bytes.fromhex("61721F97C869523CCCE093D7F849CA02"), got.hex()
    print("e1 ok")
