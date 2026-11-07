# Practice feedback — (-6,-2)

Both builds return 1. Nonzero includes negative values: O0's `cbz` does not jump, and O2's equality condition is false. O0 computes -6+4=-2, then adds 3 to reach 1. O2 selects increment 7, then computes -6+7=1. If you got -2, you replaced a zero test with a positive test. Try your own different negative urgent value after saving this feedback; explain why the result should stay the same.

The `w8` values and instruction counts differ, yet the input-to-output rule agrees for this example. This does not prove all possible programs preserve behavior under every toolchain. Save a revision with this page identified as `example-feedback`, then return to START-HERE P2.
