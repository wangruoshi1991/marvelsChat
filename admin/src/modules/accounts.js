import { createModule } from './_module.js';
export function createAccountsModule(client) { return createModule({ name:'accounts', title:'账号与权限', permission:'users:read', endpoint:'/api/admin/users?limit=120', client, columns:[{key:'displayName',label:'账号'},{key:'email',label:'邮箱'},{key:'role',label:'角色'},{key:'status',label:'状态'},{key:'lastLoginAt',label:'最近登录'}] }); }
