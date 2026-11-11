# Preserve terminal work without replacing it

Keep the exact matching course package and all original attempts. Course-specific
export commands take precedence: Tiny Browser TERMINAL.md, Storage README and Agent
League README describe their own formats. Preserve source, notes and first failures;
an exported result is evidence, not authenticated authorship or a transferable grade.

For portable Sandbox, Blockchain and Onion process work, ordinary file backup is a
supported terminal route, not an invented CLI export function. On the documented
macOS/POSIX profile, leave the course directory, choose a new sibling backup path and
copy the entire matching directory (including dotfiles and attempts):

```sh
test ! -e COURSE-BACKUP && cp -Rp COURSE-DIRECTORY COURSE-BACKUP
```

Replace both names with actual paths. The test must succeed before copying. Stop
course commands while taking the copy so source and history are a consistent set.
Keep the original. To restore, use a new destination, not an existing working folder:

```sh
test ! -e RESTORED-COURSE && cp -Rp COURSE-BACKUP RESTORED-COURSE
```

Enter RESTORED-COURSE, verify your source/notes and previous attempts remain, then run
its documented checks and a new experiment. New receipts must be additive. This copy
does not restore running relay processes, IPC circuits or ephemeral keys; start fresh
processes and circuits using the Onion instructions. A file copy is not a hardware
power-loss or synchronization guarantee. A failed copy is not a completed backup.
