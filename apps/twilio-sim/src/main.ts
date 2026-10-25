import { loadConfig } from "./env";
import { startSim } from "./server";

const config = loadConfig();
const sim = await startSim(config);
console.log(
  `Twilio simulator on ${sim.url} as ${config.phoneNumber}, delivering to ${config.webhookUrl}`,
);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void sim.close().then(() => process.exit(0));
  });
}
