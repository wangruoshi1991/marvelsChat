import { createModule } from './_module.js';
export function createTasksModule(client) { return createModule({ name:'tasks', title:'任务运营', permission:'tasks:read', endpoint:'/api/admin/tasks', client, columns:[{key:'id',label:'任务'},{key:'status',label:'状态'},{key:'agentKey',label:'Agent'},{key:'createdAt',label:'创建时间'},{key:'failureCode',label:'失败原因'}] }); }
