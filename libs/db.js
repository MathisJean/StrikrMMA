const { Pool } = require('pg');

const pool = new Pool({
	user: process.env.DB_USER,
	password: process.env.DB_PASSWORD,
	host: process.env.DB_HOST,
	database: process.env.DB_DATABASE,
	port: process.env.DB_PORT
});

/**
 * Runs fn inside a BEGIN/COMMIT transaction on a checked-out client,
 * rolling back and releasing the client automatically on failure.
 * @param {(client: import('pg').PoolClient) => Promise<any>} fn - Work to run against the transaction client.
 * @returns {Promise<any>} Whatever fn resolves to.
 */
pool.with_transaction = async function(fn){
	const client = await pool.connect();

	try{
		await client.query("BEGIN");
		const result = await fn(client);
		await client.query("COMMIT");
		return result;
	}
	catch(err){
		await client.query("ROLLBACK");
		throw err;
	}
	finally{
		client.release();
	}
};

module.exports = pool;
