import "@testing-library/jest-dom";

// Tests must never reach a real Redis. `next/jest` loads .env, which can hold live Upstash
// credentials, and lib/cache/redis reads this flag when it is first imported.
process.env.REDIS_ENABLED = "false";

// Unit tests must not read or bump the per-school fee-data counter in a database (lib/fees/feeDataVersion.ts).
process.env.FEE_DATA_VERSION = "off";
