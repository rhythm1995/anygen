# DATA-MODEL

> 表结构以原站真实 API 响应形状为基准（证据：`dreamina-clone/RECON/auth/generate-api/`、
> `dreamina-clone/RECON/network/fixtures/`）。snake_case，全部表 `created_at timestamptz default now()`。

## ER 概览

```
auth.users (Supabase)
  └─ profiles 1─1 users
       ├─ credit_ledger 1─N（流水）
       ├─ chats 1─N ─ messages 1─N
       ├─ projects 1─N（画布，graph jsonb）
       ├─ assets 1─N（S3 产物/上传）
       └─ generation_tasks 1─N ─ outputs[] → assets

feed_items（全局公共，无属主）
agent_skills / agent_models（agent 配置，seed 静态）
```

## 表定义

### profiles
| 列 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | = auth.users.id |
| name | text | 昵称（对齐 get_user_info.name） |
| avatar_url | text | 头像 |
| description | text | 简介 |
| credit_balance | int not null default 0 | 当前可用积分（冗余余额，由 ledger 事务维护） |

### credit_ledger
| 列 | 类型 | 说明 |
|---|---|---|
| id | bigserial PK | |
| user_id | uuid FK→profiles | |
| delta | int not null | 正=充值/退还，负=消耗 |
| reason | text not null | signup_bonus / generation_consume / generation_refund / topup |
| task_id | uuid null | 关联 generation_tasks |
| balance_after | int not null | 事务内计算，审计一致性 |

约束：事务内 `sum(delta) = profiles.credit_balance`；扣减用 `update ... where credit_balance >= cost` 原子守卫。

### feed_items
| 列 | 类型 | 说明 |
|---|---|---|
| id | text PK | 原站 common_attr.id |
| title | text | 常为空串（对齐捕获） |
| cover_url | text not null | **本地 seed 路径** `/seed/feed/<id>.jpg`（签名图已过期） |
| width / height | int | aspect ratio 用 |
| author_name / author_avatar | text | |
| model_req_key | text | 如 seedream/seedance 标识（aigc_image_params） |
| generate_type | text | text2image / image2image / text2video |
| sort_key | bigserial | 稳定分页序 |

### agent_models（seed）
| 列 | 类型 | 说明 |
|---|---|---|
| key | text PK | model_req_key |
| name | text | 如 "Image 2.1" / "Video S2.5 Pro"（对齐 agent_config.model_list） |
| kind | text | image / video |
| default | bool | default_model_index 对齐 |

### agent_skills（seed）
| 列 | 类型 | 说明 |
|---|---|---|
| id | text PK | skill_data[].id |
| name / title / description | text | 对齐 skill_data |
| enabled | bool | |

### projects
| 列 | 类型 | 说明 |
|---|---|---|
| id | uuid PK default gen_random_uuid() | |
| user_id | uuid FK | |
| name | text not null | "New project" 默认名（对齐 canvas 入口态文案） |
| thumbnail_url | text null | 画布快照（后续） |
| graph | jsonb not null default '{}' | xyflow {nodes:[], edges:[], viewport}，zod 校验节点形状 |
| graph_version | int not null default 1 | 兼容演进 |

### assets
| 列 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK | |
| kind | text not null | image / video / audio / doc / element（对齐 canvas 资产筛选 tabs） |
| storage_key | text not null | S3 key（`image/<uid>/<uuid>.jpg`） |
| url | text not null | `CDN_BASE_URL/storage_key` |
| mime | text | |
| width / height / size_bytes | int null | |
| meta | jsonb default '{}' | 生成参数回执（prompt/model/seed…） |

### chats / messages
| 列 | 类型 | chats | messages |
|---|---|---|---|
| id | uuid PK | | |
| user_id | uuid FK | ✓ | ✓ |
| chat_id | uuid FK→chats | — | ✓ |
| title | text | "New chat"（对齐 generate 侧栏） | — |
| role | text | — | user / assistant |
| content | text | — | tiptap JSON 或纯文本 |
| task_ids | uuid[] | — | 关联生成任务 |

### generation_tasks
| 列 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK | |
| type | text not null | image / video |
| prompt | text not null | |
| params | jsonb not null | model/ratio/count/duration…（对齐 aigc_image_params.text2image_params 形状） |
| status | text not null | queued / running / succeeded / failed |
| remote_id | text null | Ark 任务 id |
| error | text null | 失败原因 |
| cost | int not null | 消耗积分 |
| started_at / finished_at | timestamptz null | 超时回收用 |

## RLS 策略（全部 enable row level security）

- profiles/chats/messages/projects/assets/generation_tasks/credit_ledger：
  `using (auth.uid() = user_id)`（profiles 为 `id = auth.uid()`）
- feed_items / agent_models / agent_skills：公共读 `to authenticated using (true)`，仅 service_role 写
- storage（S3）：不涉 RLS，key 路径含 user_id + API 层校验属主

## 索引
- generation_tasks(user_id, status)、assets(user_id, kind, created_at desc)、
  messages(chat_id, created_at)、feed_items(sort_key)、credit_ledger(user_id, created_at desc)

## 原站形状对照（seed 与契约的证据表）
| 本项目 | 原站 fixture |
|---|---|
| feed_items | RECON/network/fixtures/mweb-v1-feed-*.json（item_list[].common_attr/author/image.large_images） |
| agent_models/skills | RECON/auth/generate-api/mweb-v1-creation_agent-v2-get_agent_config.json（model_list/skill_data） |
| me 接口 | …/mweb-v1-get_user_info.json + commerce-v1-benefits-user_credit.json |
| projects 列表 | …/mweb-v1-infinite_canvas-list_project.json（projects[]/next_cursor/has_more） |
| 工作区 | …/cc-v1-workspace-get_user_workspaces.json（本项目 v1 单工作区，不建表） |

---

# 增量设计（2026-08-30 · 三件套：Admin 美元计费 / CN 创作面板 / 审核 + Agent）

> 详细设计见 ADMIN.md / UI-SPEC-CN.md / MODERATION.md / AGENT-RESEARCH.md。本节为数据模型汇总。

## 新表一览

| 表 | 用途 | 关键列 |
|---|---|---|
| providers | 生成供应商 | name, protocol(ark/openai-compat), base_url, enabled |
| api_keys | 供应商密钥（pgcrypto 加密） | secret_encrypted bytea, secret_hint(尾4位), enabled |
| models | 模型配置 = 创作面板数据源 | provider_id, creation_type(7类), code, display_name, badge, unit_type(per_image/per_second/per_token/per_request), price_cents, provider_cost_cents, resolution_factor jsonb, enabled, sort |
| ledger | 美分账本（替代 credit_ledger） | cents int, reason(signup_bonus/generation/generation_refund/topup/admin_adjust/agent_step), task_id, balance_after_cents |
| creation_modes | 创作类型面板配置 | key(agent/image/video/music/dubbing/digital_human/motion_mimic), label, icon, enabled, sort |
| agent_skills 扩展 | 官方技能 | + official bool, plan_template jsonb, description |
| agent_sessions | Agent 会话 | user_id, prompt, plan jsonb, status(planning/running/succeeded/failed), budget_cents, spent_cents, summary |
| agent_steps | Agent 步骤 | session_id, seq, type, prompt, params, status, task_id, asset_id, error, cost_cents |
| moderation_events | 审核事件 | target_type(prompt/asset/feed_item), target_id, auto_score, auto_verdict, status(pending/approved/rejected/human_review), reviewer |
| user_reports | 用户举报 | reporter, target_type, target_id, reason, status |
| admin_audit_log | 后台审计 | admin_id, action, target_table, target_id, diff jsonb |

## 既有表变更

| 表 | 变更 |
|---|---|
| profiles | + role text default 'user'（user/admin）；+ balance_cents int（替代 credit_balance）；+ preference jsonb（生成偏好：默认比例/分辨率/模型） |
| generation_tasks | + model_code text；+ moderation_status text default 'pending'；cost 改 cost_cents |
| assets | + moderation_status text default 'pending' |
| feed_items | + moderation_status text default 'approved'（seed 数据视为已审） |

## 迁移顺序（实现时）

```
0005_admin_billing:  providers/api_keys/models/ledger/creation_modes + profiles.role/balance_cents
                     + data migration: credit_ledger → ledger（积分×汇率折美分）
0006_agent:          agent_sessions/agent_steps + agent_skills 扩展(official/plan_template)
0007_moderation:     moderation_events/user_reports + 三表 moderation_status
0008_cn_seed:        models 灌即梦截图的真实模型清单（图片 5.0 Pro…/Seedance 2.5…）+
                     creation_modes 灌 7 类型 + agent_skills 灌官方技能
```

## RLS 原则（增量）
- providers/api_keys/models/creation_modes：authenticated 读，写仅 service_role（admin API 用 service 通道 + AdminGuard）
- ledger/agent_sessions/agent_steps：本人
- moderation_events/user_reports：admin 读（service 通道），用户仅能看自己的举报
- admin_audit_log：只许 service_role 写，admin 读
