import { createHash, randomUUID } from 'node:crypto';
import { pgPool } from '../db/pool.ts';
export async function issueReadingReceipt(userId:number,contentId:number|null,domainId:number|null,referenceHash:string|null,audio:string,result:any) {
 if(!result?.transcript?.trim() || !result.scores || !result.delivery) throw new Error('Incomplete reading analysis');
 const fingerprint=createHash('sha256').update(Buffer.from(audio,'base64')).update(String(contentId)).update(String(domainId)).update(referenceHash ?? '').digest('hex');
 const receipt=(await pgPool.query(`INSERT INTO reading_receipts(id,user_id,content_id,domain_id,reference_hash,fingerprint,result) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(user_id,fingerprint) DO UPDATE SET fingerprint=EXCLUDED.fingerprint RETURNING id,result`,[randomUUID(),userId,contentId,domainId,referenceHash,fingerprint,JSON.stringify(result)])).rows[0];
 return {...receipt.result,receiptId:receipt.id};
}
