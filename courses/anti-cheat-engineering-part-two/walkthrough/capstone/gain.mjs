// Unit 17, new application: a budget for what the slow-pong faker gains. Lesson 17, "Use the
// idea on a new case", gives the task; examples/check-gain.mjs checks it. No finished
// gainBudget is supplied, and nothing here is one of the files the unit 17 checks read.
//
// gainBudget(courier, limit) -> { pass, gain }
//   courier: what courierAt in checks/scoreboard.mjs returns. Only courier.deliveries is
//   read: { honest, naive, slow }, the mean deliveries a session of each client.
//   gain: how much more the slow-pong faker delivers a session than an honest courier, as a
//   fraction of the honest courier's deliveries (0.25 means a quarter more, and a negative
//   gain means fewer); null when the honest courier delivers nothing.
//   pass: true when gain is a number and at most limit; false otherwise.
export function gainBudget(courier, limit) {
  throw new Error('gainBudget: not written yet');
}
