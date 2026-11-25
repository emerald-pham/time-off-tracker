# The account document merges edits entry by entry

Each signed-in device used to keep the copy of `users/{uid}` it loaded and save every edit as a full `setDoc`. A device whose page stayed open (an iPad on the counter, a Mac tab) then wiped whatever another device had changed since. Now the app follows the document live (`onSnapshot`), and an edit writes only the entries it changed: one setting, one Occasion or one Earn Date edit at a time. Two devices editing different entries both keep their changes, online or offline. Two devices editing the same entry end with whichever write reached the server last, and an Occasion is always replaced whole, so its range, name and Day Types never mix. No edit ever writes the whole document; only "Replace it with this device's data", in the first-sign-in handoff, does, because that's what it means.

The document is now version 2:

```
{ version: 2, updatedAt, data: {
    settings: { hireDate, weeklyHours, ... },
    earnDateEdits: { "vacation:2026:3": "2026-04-06", ... },
    occasionsById: { <id>: Occasion, <deleted id>: null },
    occasions: [Occasion, ...]      // version 1's list, never written again
} }
```

Version 1 kept Occasions as a list, which can't be written one entry at a time. Rather than convert it with one whole-document write, which a device holding a stale copy would get wrong, the list stays as it was. Occasions saved since go in `occasionsById`, which overrides the list by id, and a deleted Occasion is `null` there so the list can't bring it back. Settings and Earn Date edits were already maps, at the same paths.

## Considered Options

- **Keep full saves, re-read before each one**: still loses whatever lands between the read and the write, and a device that's offline can't re-read at all.
- **Transactions**: they fail offline, and offline editing is a requirement (ADR 0001).
- **Convert version 1 in one whole-document write, then patch**: a device that's offline with the version 1 copy, or that hasn't seen the conversion yet, writes its stale copy over everything other devices did since, or brings back a document deleted elsewhere. An earlier draft of this change did that; an independent review reproduced all three on the emulator.
- **Occasions stay a list, changed with `arrayUnion` and `arrayRemove`**: elements are matched by whole value, so two devices editing the same Occasion would leave two copies with one id.
- **Store each Occasion as its own document**: merges just as well, but needs a subcollection, more reads, and rules for a second path. Not worth it for one person's few dozen Occasions.

## Consequences

- **Writes:** while a device has seen the document, an edit is an `updateDoc` of the changed fields, which fails if the document has since been deleted, so a stale device can't bring deleted data back. With no document seen (a new account, or one deleted while this device watched), an edit is a `setDoc` with `mergeFields` of just those entries: it creates the document, or merges into one another device created meanwhile. A new document can therefore hold only some parts; loading fills in the defaults.
- **Rules:** only version 2 documents can be created, and the version can never go down, so a tab still running an older app can't recreate deleted data or overwrite version 2. Its edits are refused, and that app doesn't say so; it shows the version 1 list, without later Occasions, until it's reloaded. From version 2 the rules also check each part's shape and whitelist the settings fields; adding a setting means updating the rules in the same deploy.
- **The list and the null markers stay:** a document that started at version 1 keeps its list, and every deleted Occasion leaves a `null`, until "Replace it with this device's data" writes the document afresh. Both are a few bytes each.
- **Newer versions:** an app that finds a version above its own refuses to save and asks the person to reload, rather than overwrite a shape it doesn't understand. The device's local copy follows the same rule.
- **Writes don't wait for the server:** a save resolves once it's on the device, because offline Firestore never acknowledges it. Sign-out and "Delete my data" wait for the server explicitly instead (spec "Accounts and sync").
- **Signed out, the same rule applies between tabs:** an edit is read-modify-write against local storage, so two tabs editing different entries both keep theirs.
