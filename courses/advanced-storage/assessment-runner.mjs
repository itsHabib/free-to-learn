import { verifyInvestigation, verifyTransfer } from './investigation.mjs';
try {
  const verify=process.argv[2]==='transfer'?verifyTransfer:verifyInvestigation;
  process.stdout.write(JSON.stringify(await verify(process.argv[3],process.argv[4],process.argv[5])));
} catch(error) { process.stdout.write(JSON.stringify({verificationError:error.message})); process.exitCode=3; }
