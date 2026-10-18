import "@testing-library/jest-dom";

// Tests must never reach a real Redis. `next/jest` loads .env, which can hold live Upstash
// credentials, and lib/cache/redis reads this flag when it is first imported.
process.env.REDIS_ENABLED = "false";
