-- 0010: 视频模型参考模式支持矩阵（CONCLUSIONS D9 / §3.5）
-- 数据源：RECON/jimeng-cn/video_generate_model_config.json（2026-08-30 原站实测）
-- 逐模型 options 提炼：首尾帧/超长视频仅 Seedance 2.5 支持；1.0/1.5 系无全能参考。
-- UI 据此渲染可用模式 + 切模式自动匹配模型（已为您匹配至最佳模型）。
update public.models
set params = jsonb_set(params, '{reference_modes}',
  '["unified_edit","first_end_frame","smart_multi","smart_edit","long_video"]'::jsonb)
where creation_type = 'video' and code = 'dreamina_seedance_45_pro';

update public.models
set params = jsonb_set(params, '{reference_modes}',
  '["unified_edit","smart_multi","smart_edit"]'::jsonb)
where creation_type = 'video'
  and code in ('dreamina_seedance_40_mini', 'dreamina_seedance_40', 'dreamina_seedance_40_pro',
               'dreamina_seedance_40_vision', 'dreamina_seedance_40_pro_vision',
               'dreamina_minimax_h3', 'dreamina_happyhorse_v1_1');

update public.models
set params = jsonb_set(params, '{reference_modes}',
  '["smart_multi","smart_edit"]'::jsonb)
where creation_type = 'video'
  and code in ('dreamina_ic_generate_video_model_vgfm_3.5_pro',
               'dreamina_ic_generate_video_model_vgfm_3.0_pro',
               'dreamina_ic_generate_video_model_vgfm_3.0_fast');
