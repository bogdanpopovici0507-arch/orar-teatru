const { createClient } = require('@libsql/client');

const TURSO_URL = process.env.TURSO_DATABASE_URL || 'libsql://orarteatru-bogdanpopovici0507-arch.aws-eu-north-1.turso.io';
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN || 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3OTI3MjY2NjksImlkIjoiMDFhMTY2ZDUtODgwMS03MDdmLWI2NjctOTRiNzEzMTY5NGY5Iiwia2lkIjoiTWl4ZGlfVDUyTjVLNHVhQng3X2lnendLa25ndXVDMjhwOUlaUV9tZ2NGWSIsInJpZCI6IjU0MzdkZTMwLTVkZWMtNDhlMi1iNDY3LWZiYzczOTJhOGQ0OCJ9.LxkmHAClVo8_BzBnXkDqmJnhYxLStpwEjldrt6cbVT1f9PXUHD8yqx2MkQxxYtk2zfrDsvWLTOFHOvZwXOaRBQ';

const client = createClient({
  url: TURSO_URL,
  authToken: TURSO_TOKEN
});

async function queryAll(sql, args = []) {
  const res = await client.execute({ sql, args });
  return res.rows;
}

async function queryGet(sql, args = []) {
  const res = await client.execute({ sql, args });
  return res.rows.length > 0 ? res.rows[0] : null;
}

async function queryRun(sql, args = []) {
  const res = await client.execute({ sql, args });
  return {
    lastInsertRowid: res.lastInsertRowid !== undefined ? Number(res.lastInsertRowid) : 0,
    changes: res.rowsAffected
  };
}

async function executeMultiple(sql) {
  return await client.executeMultiple(sql);
}

module.exports = {
  client,
  queryAll,
  queryGet,
  queryRun,
  executeMultiple
};
