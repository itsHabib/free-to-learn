export const course = {
  id: 'onion-circuit-lab', version: '0.3.0', title: 'Build Your Own Onion Routing Network',
  subtitle: 'Circuit Observatory — a controlled, offline model inspired by Tor',
  goal: 'Build and diagnose a multi-hop onion circuit, then defend exactly which observer can learn which facts from its traffic.',
  audience: 'Developers comfortable with JavaScript functions, arrays, objects, loops, imports, exceptions and a terminal. No cryptography background is assumed.',
  scope: 'An educational toy. Not Tor-compatible, not an anonymity system, and never for real private traffic. All relays and the archive run in one process. Keys exist only for a run.',
  supplied: ['AES-256-GCM wrappers from installed node:crypto', 'In-process relay wiring and fictional read-only archive', 'CLI, practice feedback, attempt preservation and static workbench', 'Fresh key creation, circuit lifecycle and trace projection'],
  learnerOwned: ['Path selection', 'Forward onion construction', 'Single-hop validation and return layers', 'Replay policy', 'Failure recovery choice', 'Traffic-observation analysis and capstone argument'],
  modules: [
    {
      id: 1, title: 'Choose a path and name the observer', kind: 'procedure', depends: [],
      goal: 'Choose a three-relay path and distinguish a relay’s local view from the simulator’s complete view.',
      artifact: 'selectPath returns three distinct usable relay IDs or reports NO_PATH.',
      difficulty: 'Directory filtering, distinctness and observer scope interact; crypto is not introduced yet.',
      sections: [
        { title: 'A request with several observers', question: 'p1',
          text: `You want the fictional archive to receive a lookup without giving one ordinary relay both the client label and the archive request. A relay is a program that forwards traffic. A circuit is an ordered path through relays. In our running path, client → cedar → birch → maple → archive, cedar is the entry, birch is the middle and maple is the exit. These are roles on this path, not permanent properties of the programs.

Every arrow is a function call in one local execution context: a Node process on the CLI path or a disposable worker in the browser. A packet is a JavaScript object handed to the next function. The process operator can inspect all objects, keys and calls. We will deliberately restrict the trace shown for each relay to what that relay receives or sends. This restricted trace is a teaching view, not a security boundary.

A neighbor is the program immediately before or after a relay. Cedar’s incoming neighbor is client and its outgoing neighbor is birch. Knowing a neighbor is different from knowing the final destination or reading a request. The next modules add encryption so that opening one layer will reveal only the next instruction and an inner packet. Before that implementation exists, predict the local path facts for a changed route.` },
        { title: 'Select before constructing', question: 'q1',
          text: `The directory is a supplied list of relay records with id and online fields. The exercise owns every relay in the list. An offline relay is unavailable; a failed ID is also excluded even if its directory record still says online. The list may contain repeated IDs. Two rows for cedar are still one relay, so repeated IDs cannot fill two positions.

For a two-hop sibling example, suppose the directory contains oak, pine and yew, pine is offline, and no IDs have failed. Inspect each record, retain oak and yew, remove duplicate IDs, then take both. The resulting circuit uses two different programs. If yew also fails, report NO_PATH. Using oak twice would not create another independent observer.

In your three-hop build, filter first, deduplicate second, and check that enough candidates remain before returning any path. This order prevents an early slice from overlooking usable relays later in the directory. You may preserve directory order, reverse it or make another deterministic choice. The tests accept every valid path; randomness is not the learning objective. Leave the directory unchanged so that later recovery sees the same facts.` },
        { title: 'Make the first build', question: 't1',
          text: `Implement selectPath in learner/solution.mjs. Its inputs are the directory, a list of failed IDs, and an optional length that defaults to three. Return an array of IDs of exactly that length. If there are too few distinct online non-failed IDs, throw LabError with code NO_PATH. The imported requireThat helper throws that error when its first argument is false.

Run the module 1 check before moving on. The other functions intentionally remain unfinished, so the full-course check will still fail. A failed check identifies its input and requirement; fix that behavior and run the same module again. Every run saves your source before executing it. The earlier source stays available after your repair.

There is no claim that three relays automatically create privacy. In this simulator all three have one operator. On a real network, ownership, route selection, connection metadata and the observer’s reach matter. Your first artifact establishes a path contract, which the encryption and visibility exercises can now use.` }
      ],
      build: 'Implement selectPath. Run: node tools/lab.mjs check 1',
      hints: ['Filter on both online and failedIds before choosing a path.', 'A Set of IDs removes repeated directory rows; compare its size with length.', 'For a two-hop sibling with candidates oak, oak, yew, distinctness leaves oak and yew. Return exactly length IDs or throw NO_PATH.'],
    },
    {
      id: 2, title: 'Wrap the onion from the destination outward', kind: 'procedure', depends: [1],
      goal: 'Construct a nested authenticated packet that each relay can open exactly one layer at a time.',
      artifact: 'wrapRequest builds the entry packet using a separate forward key for each hop.',
      difficulty: 'Nested values, reverse construction order, key scope and associated data interact.',
      sections: [
        { title: 'What a layer promises', question: 'q2',
          text: `Plaintext is the value before encryption. Ciphertext is its encrypted representation. A symmetric key is a secret shared by the sender and the intended opener of a layer. The client shares a different forward key with each relay. Sharing the cedar key with birch would defeat the intended separation.

Authenticated encryption checks that ciphertext and its associated context have not changed before returning plaintext. The supplied seal and open functions use AES-256-GCM from Node’s installed crypto library on the CLI path and built-in Web Crypto in the browser. You do not implement AES or an authentication algorithm. seal returns a packet containing a sequence number, ciphertext and an authentication tag. The tag is checked by open; a failed check throws AUTH_FAILED without returning any plaintext.

Associated data is authenticated context that need not be secret. Here it binds a layer to the protocol version, circuit ID, relay ID, direction and sequence. A circuit ID labels one run’s circuit. A direction distinguishes traffic toward the archive from traffic toward the client. A sequence identifies a packet position within a direction. Binding these fields prevents a ciphertext from being accepted in another context merely because someone changes an outer label. The context is reconstructed locally, not trusted from a peer’s assertion.` },
        { title: 'Build inside, open outside', question: 'q3',
          text: `Each forward plaintext has two fields: next, the successor’s label, and body, the value to forward. At the exit, next is archive and body is the lookup. At an earlier relay, body is the entire encrypted packet for its successor. The earlier relay can read next after authenticating its own layer, but it lacks the successor’s key.

Consider a two-hop sibling path through oak and yew. First make a yew layer containing the archive instruction and lookup. Then place that encrypted packet inside an oak layer whose next field names yew. The outermost key therefore belongs to the first relay even though that layer was constructed last. Opening follows oak then yew; construction follows yew then oak.

For the running three-hop path, start with the request as a current body. Visit hops from the last index to zero. At each visit, create next from the following hop’s relayId, using archive when there is no following hop. Seal that instruction with the current hop’s forwardKey and its context, and use the resulting packet as the new current body. Return the final packet. Do not attach the request or the full route beside the ciphertext: doing so would disclose the facts the layers are meant to hide.` },
        { title: 'Keep nonces unique', question: 't2',
          text: `A nonce is an input to an encryption operation that must not repeat under the same key. GCM can fail catastrophically if a key and nonce pair is reused. In this toy, the wrapper encodes the sequence in a 12-byte nonce, uses fresh keys for every hop and direction of every new circuit, and rejects a second seal with the same key and sequence. The visible sequence is not a secret.

Changing only the circuit ID in associated data would not make nonce reuse safe. Associated data binds meaning; it does not create a new encryption key. The supplied circuit setup creates new key handles and keeps their bytes private inside the crypto wrapper. This is a trusted in-process setup, not an authenticated key exchange. A real remote relay cannot obtain its key by reaching into this process.

Implement wrapRequest and run the cumulative module 2 check. It tests both two-hop and three-hop paths, so hard-coding cedar, birch or maple will fail. Read the executed one-layer sibling in examples/sibling.mjs if the API is unfamiliar. Your task is to compose that operation into the onion, keeping the original request out of all unencrypted packet fields.` }
      ],
      build: 'Implement wrapRequest with seal and context. Run: node tools/lab.mjs check 2',
      hints: ['The exit must get the request after its one open operation.', 'Track one current body. Each iteration replaces it with an encrypted wrapper for an earlier hop.', 'The two-hop sibling seals yew first, then puts that packet in oak’s body. Its open order is oak, yew.'],
    },
    {
      id: 3, title: 'Forward one layer and bring the reply back', kind: 'procedure', depends: [1,2],
      goal: 'Open a single local instruction and build the reverse encryption path for the archive reply.',
      artifact: 'peelForward, addReturnLayer and unwrapReply complete an offline round trip.',
      difficulty: 'Forward removal and backward addition run in opposite directions; state belongs to one relay.',
      sections: [
        { title: 'A relay has local state', question: 'q4',
          text: `Each relay state contains its own relayId, circuitId, previous and next neighbor, its two key handles, and a seenForward set. It contains neither the complete path nor the other relays’ keys. The harness knows the whole circuit to connect the calls; the learner’s peelForward function receives only one state and one packet.

Open the packet using this relay’s forward key and the forward context. Check that the opened value contains body and that its next field equals the successor recorded during setup. Authentication says that the layer came from a holder of the key and has not been altered. It does not say that the instruction is valid for the local circuit. This separate route check detects a bug or an inconsistent instruction even when its tag is valid.

For a sibling circuit whose local state says next is yew, a valid layer saying next is ash must be rejected with BAD_ROUTE. The relay should not reinterpret the circuit or forward to a new program because a packet asks it to. On success, return the opened next and body unchanged. The harness forwards body to the next relay. In module 4 you will add freshness immediately before returning; for now you may leave the supplied seenForward set untouched.` },
        { title: 'The reply gains layers', question: 'q5',
          text: `The archive sends its reply to the exit. The exit can read the archive’s reply because our fictional archive has no separate endpoint encryption. The exit encrypts the reply with its backward key. Each earlier relay adds its own backward layer around the packet it receives, without opening that inner packet. Thus the reply gains layers as it approaches the client.

For oak → yew → archive, yew first wraps the reply, then oak wraps yew’s packet. The client opens oak’s layer, then yew’s layer. This reverse-direction behavior is not the forward routine run backward: forward relays remove layers; backward relays add them. Separate forward and backward keys prevent the two directions from using the same key and nonce pair when each begins at sequence zero.

Implement addReturnLayer as one seal with the backward key and context. Implement unwrapReply by opening each hop’s backward layer in path order. The caller’s expectedSeq must be used in every layer’s context. unwrapReply verifies the cryptographic layers but has no replay state argument; the supplied client tracks received sequence numbers only after successful matched unwrapping. A pure decrypt function and a stateful receiver have different jobs. Keep those jobs explicit.` },
        { title: 'Bind the reply to its request', question: 'q3binding',
          text: `An authentic reply can belong to a different request. Suppose the client is waiting for request twelve but receives an unchanged reply for request eleven. Its tag may be genuine. If you derive the expected sequence from that packet, you only establish which sequence the packet claims; you never compare it with the request the caller expects.

Use the caller’s expectedSeq for every open operation. In the sibling case, passing twelve into open rejects the packet for eleven with BAD_PACKET before releasing a reply. Supplying eleven later can still open that same genuine packet. Also reject an onion whose outer layer matches twelve but whose inner layer belongs to eleven: checking only the outside leaves a gap at the next hop.

Request matching does not require increasing arrival order. Two calls may unwrap reply twelve and then reply eleven, provided each supplies its own matching expected sequence. Independent circuits may also use the same sequence under different keys. These are valid matches. Replay acceptance remains a separate stateful receiver decision; do not add a global seen set or maximum sequence to unwrapReply.` },
        { title: 'Inspect an actual round trip', question: 't3',
          text: `Run the module 3 check, then the demo command. The demo uses your functions for both directions. It returns the fictional archive record and shows a trace grouped by observer. Inspect cedar, birch, maple and archive separately before reading the complete group.

Cedar sees the client neighbor and birch. Birch sees cedar and maple. Maple sees birch, the archive instruction and the plaintext lookup; the archive sees maple as its caller. The trace records packet sizes and sequences as well as payload visibility. Encryption does not hide that a packet was forwarded, and our variable-size JSON encoding leaks more structure than a fixed-size cell design would. The toy also shares one circuit ID across hop states and carries the same sequence across layers. Colluding observers can use those labels; the separate timing exercise deliberately omits them. This is another reason these views do not establish anonymity.

These view fields are projections that the harness writes after each action, not evidence that JavaScript has isolated three adversarial machines. To inspect causality, open the offline workbench, commit its prediction, and step through the generated demonstration. The trace data comes from a reference execution, clearly marked as a demonstration. Your own CLI run and saved source establish whether your build performs the same required behaviors.` }
      ],
      build: 'Implement peelForward, addReturnLayer and unwrapReply. Run: node tools/lab.mjs check 3; then node tools/lab.mjs demo',
      hints: ['peelForward opens one forward layer; it does not loop through the path.', 'For the return path the harness loops exit-to-entry and calls addReturnLayer once per hop.', 'A two-hop return has oak outside yew. The client removes oak first. Use backward keys at both ends.'],
    },
    {
      id: 4, title: 'Separate authenticity from freshness', kind: 'procedure', depends: [2,3],
      goal: 'Reject changed and repeated packets while preserving receiver state when authentication fails.',
      artifact: 'acceptSequence and peelForward enforce bounded, circuit-local replay tracking.',
      difficulty: 'Authentication order, state mutation and out-of-order valid arrival must remain distinct.',
      sections: [
        { title: 'A valid packet can be old', question: 'p4',
          text: `A replay is a previously valid packet sent again. Copying ciphertext does not alter its tag, so authenticated encryption alone can accept the copy. A receiver needs state to distinguish a fresh packet from one it has already accepted.

The toy’s freshness policy is explicit: accept an unseen integer sequence from zero through 1023, reject a repeated value with REPLAY, and reject an out-of-range or non-integer value with BAD_SEQUENCE. The seenForward set belongs to one relay on one circuit. It is bounded by the finite sequence range. The policy permits out-of-order arrival; accepting sequence eight does not by itself forbid an unseen sequence two. This is a teaching policy, not a claim about Tor’s ordering rules.

Before you modify the relay, predict what happens if an altered packet arrives before the original packet with the same sequence. Use the distinction between authentication and receiver state. Then implement acceptSequence: validate the range, reject membership, and add only a fresh sequence.` },
        { title: 'Commit state after validation', question: 'q6',
          text: `The receiver’s order is open, validate the route, then accept the sequence. Only after those steps should the harness receive a body to forward. If you add a sequence before authenticating, a forged packet can occupy the set entry and cause a later genuine packet to be rejected as a replay. The forged packet would have changed application state without proving anything.

For a sibling receiver with an empty set, a damaged sequence five throws AUTH_FAILED and leaves the set empty. A genuine sequence five can then be accepted and recorded. The next copy of that genuine packet authenticates but throws REPLAY. If its authenticated next field is wrong, it throws BAD_ROUTE and also leaves the set unchanged.

The lab deliberately keeps a circuit available after a rejected packet so you can inspect this distinction. It is not prescribing recovery behavior for a production anonymity protocol. Real protocols may tear down a circuit after an integrity failure. Our exact contract is local rejection without state mutation, which the checker can reproduce without any external traffic.` },
        { title: 'Test the reason for rejection', question: 't4',
          text: `Run the cumulative module 4 check. It changes a ciphertext byte, changes the visible sequence, replays a valid packet, sends a packet to another circuit, and corrupts a return packet. A tag failure should not be reported as a replay. A replay should not be accepted merely because its tag is valid. These distinct outcomes make debugging useful.

When a test fails, first inspect the named input and error code, then inspect the state mutation nearest that code. If the original packet cannot pass after a damaged one, inspect when seenForward was changed. If a packet crosses circuit boundaries, inspect the context used by open and which key handle you supplied. Avoid fixing a symptom by catching every error and returning success.

Authentication protects a message relative to a key. It does not protect against the legitimate exit reading the plaintext that it is meant to receive. It also does not hide timing, lengths or endpoint identifiers. Carry this distinction into the recovery work: a fresh circuit solves some state problems, but it does not erase observations already made.` }
      ],
      build: 'Implement acceptSequence and call it in peelForward after authentication and route validation. Run: node tools/lab.mjs check 4',
      hints: ['A seen set answers whether a value was accepted, not whether it was observed on the wire.', 'Do not mutate the set until open and the route check have both succeeded.', 'For a sibling arrival sequence damaged-5, genuine-5, genuine-5: keep the set empty, then add 5, then reject the duplicate.'],
    },
    {
      id: 5, title: 'Rebuild after a failed hop', kind: 'procedure', depends: [1,3,4],
      goal: 'Choose a valid replacement circuit and explain why retrying cannot prove exactly-once delivery.',
      artifact: 'recoveryPlan chooses rebuild or stop; supplied lifecycle closes the old circuit and generates fresh keys.',
      difficulty: 'Availability, key lifecycle and uncertainty about endpoint receipt interact.',
      sections: [
        { title: 'Failure leaves partial progress', question: 'q7',
          text: `A circuit can fail after earlier relays have already acted. If birch is unavailable, cedar may have opened the packet and recorded its sequence, while maple and the archive have seen nothing. Reusing the same packet from the start would now encounter cedar’s replay state. Clearing that state without considering old packets would remove the rule you just built.

The toy’s recovery policy closes the old circuit and establishes a replacement. Closing marks the old circuit unusable and discards its key handles. Establishing creates a new circuit ID, fresh forward and backward keys and empty receiver sets. Old packets cannot authenticate on those new keys. Sequence zero may be used again because its encryption keys are different.

Implement recoveryPlan using the directory and failed IDs. Keep the old path length and use the same distinctness and availability rules from module 1. Return a rebuild action with the new path, or a stop action with reason NO_PATH. The supplied recover function performs closure and setup; your work is the decision about the path. You may reuse a still-healthy relay on a fresh circuit.` },
        { title: 'A missing reply is uncertain evidence', question: 'q8',
          text: `Now move the failure past the archive. The archive has received the lookup and made its reply, but the reply is lost before the client receives it. From the client’s missing reply alone, you cannot conclude that the request never arrived. A timeout describes what the client observed, not what every other participant did.

Our endpoint is a read-only catalog lookup. Repeating a lookup returns the record again without creating a second purchase or changing a balance. This makes an explicit retry suitable for the exercise. A general application that changes state would need its own duplicate-handling contract. An onion circuit does not provide exactly-once application effects.

Run the failover command after the module 5 check. It injects one unavailable relay, closes the old circuit, chooses a replacement and performs the read-only lookup. The report names the failed relay, new path and returned record. Separately, the lost-reply check confirms that an archive event exists before the client receives its error. Both are synthetic failures at declared function-call boundaries, not measurements of a live network.` },
        { title: 'Recover without strengthening the claim', question: 't5',
          text: `Availability and privacy are different outcomes. A replacement path that works may still use relays controlled by one observer, and rebuilding cannot revoke a trace already recorded on the previous path. This exercise excludes known failed IDs, but online is not a synonym for trustworthy.

If fewer than the required number of distinct relays remain, return stop. Silently shortening the circuit changes the observer separation promised by the path contract. Another application could explicitly choose a different policy, but that would require a new contract and new reasoning. Your checker should expose that decision rather than hide it inside a convenient retry.

For the next module, preserve the difference between facts and inferences in your report. An authenticated record and a trace establish what this simulation did. They do not establish that an outside observer could not link two communications. You will now use the same observation discipline against that stronger claim.` }
      ],
      build: 'Implement recoveryPlan. Run: node tools/lab.mjs check 5; then node tools/lab.mjs failover. Continue with WORKSHOP.md: author a multi-circuit experiment in the existing browser-code workbench or run its scenario offline with tools/browser-lab.mjs workshop.',
      hints: ['Keep oldPath.length. Exclude failed IDs even if their online field remains true.', 'Reuse selectPath, but turn only its NO_PATH error into a stop decision.', 'If a two-hop sibling loses one relay and only one distinct relay remains, report stop rather than use that relay twice.'],
    },
    {
      id: 6, title: 'Challenge the privacy claim', kind: 'procedure', depends: [1,2,3,4,5],
      goal: 'Use synthetic timing evidence and endpoint observations to state defensible limits on an onion circuit.',
      artifact: 'correlate returns all compatible timing candidates; the capstone combines the working circuit with an evidence report.',
      difficulty: 'A compatible pattern is evidence, not identity; multiple observers and endpoint content differ.',
      sections: [
        { title: 'Compare gaps instead of clocks', question: 'q9',
          text: `An observer may see encrypted packets without seeing their contents. Their arrival times and sizes are still observations. Traffic correlation compares patterns at different points to look for possible links. The Tor Project explicitly describes observers at both ends as a limit of its threat model; adding encryption alone does not remove that observation channel.

The lab uses invented event times, measured in arbitrary ticks. It does not capture real traffic. Suppose one stream appears at times ten, thirteen and twenty. Its inter-event gaps are three and seven: subtract each time from the following time. A candidate at fifty, fifty-three and sixty has the same gaps despite its different clock offset. A candidate at fifty, fifty-seven and sixty has gaps seven and three, so it is a different pattern.

Implement correlate(entryTimes, candidates, tolerance). Each candidate has id and times. Keep candidates with the same number of events and with every corresponding gap differing by at most tolerance. Require at least two events; one point provides no gap evidence. Return all matching IDs. The inputs supplied here have finite ascending times and a nonnegative tolerance. This simple comparison is an exercise in reasoning from observations, not a traffic-analysis tool for third-party targets.` },
        { title: 'Keep ambiguity and endpoint facts visible', question: 'q10',
          text: `A compatible pattern is not a proven identity. Two candidates may match because they share a schedule or because the observation is too coarse. If both match, returning only the first invents certainty. If none match, that does not prove no communication occurred: the model omits jitter beyond tolerance, batching, missing events and many other network behaviors.

The endpoint is a different observer. In our lab it sees the plaintext lookup because it must answer it. The exit also sees that lookup because endpoint encryption is not part of the toy. A separately authenticated encrypted channel to an endpoint, such as HTTPS in a real application, changes the exit’s content visibility. It does not prevent the endpoint itself from reading the request or identifying an application account. We do not implement or simulate TLS and do not handle real credentials.

The whole simulator runs under one operator with all key material in memory. Its relay views are deliberately narrower than that operator’s access. Fresh keys, valid tags, distinct relay names and a passing test suite cannot turn this program into a real anonymity system. The useful artifact is a mechanism you can inspect and a precise argument about its limits.` },
        { title: 'Build Circuit Observatory', question: 't6',
          text: `Finish the cumulative checks, then carry out CAPSTONE.md. Your deliverable is the code you wrote, a successful lookup trace, a rejected tamper and replay, a failed-hop recovery, and a report that separates each observer’s direct facts from inferences. Use the supplied report runner so the ordinary demonstration and your learner build are labeled distinctly.

The capstone changes the observation problem: scheduled senders may create the same pattern and a reply can be lost after endpoint receipt. You must keep uncertainty in your conclusions while still naming what the traces establish. No single catchphrase about encryption answers all of those cases. The capstone rubric checks the causal explanation beside the result.

Do the transfer tasks before opening any feedback for them. The public checks are practice tools whose cases you can inspect. The separate instructor assessment is outside the learner package and has no hints. Neither an author demonstration nor an assisted answer counts as an unaided learner result. If you need a hint, record it honestly and use a later fresh task to test the idea again.` }
      ],
      build: 'Implement correlate. Run: node tools/lab.mjs check all; then complete CAPSTONE.md',
      hints: ['Subtract neighboring times within each stream before comparing streams.', 'A candidate must match every gap, not only the total duration.', 'The sibling times 10,13,20 and 50,53,60 share gaps 3,7. Keep every compatible candidate, not just the first.'],
    },
  ],
};
