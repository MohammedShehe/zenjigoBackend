require('../config/env');
const fs=require('fs'), path=require('path'), mysql=require('mysql2/promise');
const config=require('../config/env');
(async()=>{
  const server=await mysql.createConnection({host:config.db.host,port:config.db.port,user:config.db.user,password:config.db.password});
  await server.query(`CREATE DATABASE IF NOT EXISTS \`${config.db.name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await server.end();
  const db=require('../config/db');
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(100) PRIMARY KEY, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  const files=fs.readdirSync(path.join(__dirname,'../../database/migrations')).filter(f=>f.endsWith('.sql')).sort();
  for(const file of files){
    const exists=await db.query('SELECT version FROM schema_migrations WHERE version=?',[file]);
    if(exists.length){ console.log(`Skipping ${file}`); continue; }
    const sql=fs.readFileSync(path.join(__dirname,'../../database/migrations',file),'utf8');
    const statements=sql.split(/;\s*(?:\r?\n|$)/).map(s=>s.trim()).filter(Boolean);
    const conn=await db.pool.getConnection();
    try{
      await conn.beginTransaction();
      for(const statement of statements) await conn.query(statement);
      await conn.query('INSERT INTO schema_migrations(version) VALUES(?)',[file]);
      await conn.commit(); console.log(`Applied ${file}`);
    }catch(e){await conn.rollback(); throw e;}finally{conn.release();}
  }
  await db.pool.end();
  console.log('Database migration complete.');
})().catch(e=>{console.error(e);process.exit(1)});
