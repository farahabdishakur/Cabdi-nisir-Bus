process.env.NODE_ENV = 'test';
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('dotenv').config({ path: '.env.test', override: true });
