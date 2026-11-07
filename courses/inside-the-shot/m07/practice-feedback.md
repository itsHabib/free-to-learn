# Count-file practice feedback — open after saving

The two values are **256 and 128**. Byte pair `00 01` gives 0 + 256; `80 00` gives 128. Appending `00` creates seven bytes while the header declares exactly six; `ValueError` is the expected result. Silently ignoring the extra byte would accept an unexplained format extension. Trusting the count without checking the actual length could decode a short slice as a plausible wrong value.

If you got 1 and 32768, you reversed byte order. If you accepted the extra byte, add the exact-length guard before your loop. If you guessed 128 was negative, note that this example explicitly supplies unsigned values; the high bit alone does not choose signedness. Explain your repair in a new record. These answers concern the toy count format only.
