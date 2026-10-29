import { createModule } from './_module.js';
export function createAuditModule(client) { return createModule({ name:'audit', title:'审计记录', permission:'audit:read', endpoint:'/api/admin/events?limit=80', client, columns:[{key:'action',label:'动作'},{key:'actorId',label:'操作者'},{key:'targetType',label:'目标'},{key:'result',label:'结果'},{key:'requestId',label:'请求 ID'},{key:'createdAt',label:'时间'}] }); }
