# The account document merges edits entry by entry

Each signed-in device used to keep the copy of `users/{uid}` it loaded and save every edit as a full `setDoc`. A device whose page stayed open (an iPad on the counter, a Mac tab) then wiped whatever another device had changed since. Now the app follows the document live (`onSnapshot`), and an edit writes only the entries it changed, with dotted-path `updateDoc`: one setting, one Occasion or one Earn Date edit at a time. Two devices editing different entries both keep their changes, online or offline. Two devices editing the same entry end with whichever write reached the server last, and an Occasion is always replaced whole, so its range, name and Day Types never mix.

To make Occasions addressable, the document moves to version 2: `data.occasions` is a map keyed by Occasion id instead of a list. Settings and Earn Date edits were already maps.

## Considered Options

- **Keep full saves, re-read before each one**: still loses whatever lands between the read and the write, and a device that's offline can't re-read at all.
- **Transactions**: they fail offline, and offline editing is a requirement (ADR 0001).
- **Occasions stay a list, changed with `arrayUnion` and `arrayRemove`**: elements are matched by whole value, so two devices editing the same Occasion would leave two copies with one id.
- **Store each Occasion as its own document**: merges just as well, but needs a subcollection, more reads, and rules for a second path. Not worth it for one person's few dozen Occasions.

## Consequences

- **Migration:** a version 1 document still loads (its list becomes the map in memory). Its first edit rewrites the whole document as version 2, from the latest copy the device has seen, and every later edit writes by entry. A version 1 document nobody edits stays as it is.
- **Rules:** the version may never go down (`firestore.rules`), so a tab still running the old app can't write a version 1 list over version 2 data. That tab may show an error until it's reloaded. From version 2 the rules also require `settings`, `occasions` and `earnDateEdits` to be maps and whitelist the settings fields; adding a setting means updating the rules in the same deploy.
- **Newer versions:** an app that finds a version above its own refuses to save and asks the person to reload, rather than overwrite a shape it doesn't understand. The device's local copy follows the same rule.
- **Writes don't wait for the server:** a save resolves once it's on the device, because offline Firestore never acknowledges it. Sign-out and "Delete my data" wait for the server explicitly instead (spec "Accounts and sync").
- **A deleted account isn't brought back by a stale device:** `updateDoc` needs the document to exist, so an offline device's queued edits fail once they reach a document deleted elsewhere. Only a device that has seen the document gone writes a whole new one.
- **Signed out, the same rule applies between tabs:** an edit is read-modify-write against local storage, so two tabs editing different entries both keep theirs.
