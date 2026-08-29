-- seed：来自原站捕获 fixtures（dreamina-clone/RECON），封面已本地化 /seed/feed/*
truncate public.feed_items;
insert into public.feed_items (id, title, cover_url, width, height, author_name, author_avatar, model_req_key, generate_type) values
('7573981096300334354', '', '/seed/feed/7573981096300334354.jpg', 640, 640, '', '', 'high_aes_general_v40', 'text2image'),
('7574149742062619920', '', '/seed/feed/7574149742062619920.jpg', 360, 640, '', '', 'high_aes_general_v40', 'text2image'),
('7574218630494178576', '', '/seed/feed/7574218630494178576.jpg', 360, 640, '', '', 'high_aes_general_v40', 'text2image'),
('7574119156920978706', '', '/seed/feed/7574119156920978706.jpg', 640, 640, '', '', 'high_aes_general_v40', 'text2image'),
('7574019801497095441', '', '/seed/feed/7574019801497095441.jpg', 360, 640, '', '', 'high_aes_general_v40', 'text2image'),
('7574010879260265729', '', '/seed/feed/7574010879260265729.jpg', 640, 640, '', '', 'high_aes_general_v40', 'text2image'),
('7574140463288995080', '', '/seed/feed/7574140463288995080.jpg', 480, 640, '', '', 'high_aes_general_v40', 'text2image'),
('7573846238576053505', '', '/seed/feed/7573846238576053505.jpg', 480, 640, '', '', 'high_aes_general_v40', 'text2image'),
('7574112031956094224', '', '/seed/feed/7574112031956094224.jpg', 480, 640, '', '', 'high_aes_general_v40', 'text2image'),
('7574146327769074951', '', '/seed/feed/7574146327769074951.jpg', 480, 640, '', '', 'high_aes_general_v40', 'text2image'),
('7574148571700694288', '', '/seed/feed/7574148571700694288.jpg', 640, 360, '', '', 'high_aes_general_v40', 'text2image'),
('7574121600052727058', '', '/seed/feed/7574121600052727058.jpg', 360, 640, '', '', 'high_aes_general_v40', 'text2image'),
('7574137826606894344', '', '/seed/feed/7574137826606894344.jpg', 426, 640, '', '', 'high_aes_general_v40', 'text2image'),
('7574178549343538440', '', '/seed/feed/7574178549343538440.jpg', 480, 640, '', '', 'high_aes_general_v40', 'text2image'),
('7574424714152627473', '', '/seed/feed/7574424714152627473.jpg', 360, 640, '', '', 'high_aes_general_v40', 'text2image'),
('7573816628098469128', '', '/seed/feed/7573816628098469128.jpg', 360, 640, '', '', 'high_aes_general_v40', 'text2image'),
('7574028652241833234', '', '/seed/feed/7574028652241833234.jpg', 360, 640, '', '', 'high_aes_general_v40', 'text2image'),
('7574008049594109202', '', '/seed/feed/7574008049594109202.jpg', 360, 640, '', '', 'high_aes_general_v40', 'text2image'),
('7574200479954013457', '', '/seed/feed/7574200479954013457.jpg', 640, 426, '', '', 'high_aes_general_v40', 'text2image'),
('7574097303020080385', '', '/seed/feed/7574097303020080385.jpg', 640, 640, '', '', 'high_aes_general_v40', 'text2image');

truncate public.agent_models;
insert into public.agent_models (key, name, kind, is_default) values
('high_aes_general_v50p_large', 'Seedream 5.0 Pro', 'image', true),
('dreamina_lib_img_20260423', '', 'image', false),
('high_aes_general_v50', 'Seedream 5.0 Lite', 'image', false),
('high_aes_general_v43', 'Seedream 4.7', 'image', false),
('high_aes_general_v42', 'Seedream 4.6', 'image', false),
('high_aes_general_v40l', 'Image 4.5', 'image', false),
('high_aes_general_v41', 'Seedream 4.1', 'image', false),
('high_aes_general_v40', 'Seedream 4.0', 'image', false),
('external_model_gemini_flash_image_v25', 'Nano Banana', 'image', false),
('high_aes_general_v30l_art:general_v3.0_18b', 'Seedream 3.1', 'image', false),
('high_aes_general_v30l:general_v3.0_18b', 'Seedream 3.0', 'image', false),
('dreamina_seedance_45_pro', 'Dreamina Seedance 2.5', 'video', false),
('dreamina_seedance_40_mini', 'Dreamina Seedance 2.0 Mini', 'video', false),
('dreamina_seedance_40', 'Dreamina Seedance 2.0 Fast', 'video', false),
('dreamina_seedance_40_pro', 'Dreamina Seedance 2.0', 'video', false),
('dreamina_ic_generate_video_model_vgfm_3.5_pro', 'Dreamina Seedance 1.5 Pro', 'video', false),
('dreamina_ic_generate_video_model_vgfm_3.0_pro', 'Dreamina Seedance 1.0', 'video', false),
('dreamina_ic_generate_video_model_vgfm_3.0_fast', 'Dreamina Seedance 1.0 Fast', 'video', true);

truncate public.agent_skills;
insert into public.agent_skills (id, name, title, description, enabled) values
('web_agent_skill_story', 'Cinematic Story Video', 'Story Video', 'Automatically generate a story outline and storyboard script, then produce a short video', true),
('web_agent_skill_ecommerce', 'E-commerce Image Set', 'E-commerce Image Set', 'Generate a complete set of visually consistent product assets for major e-commerce platforms', true),
('web_agent_skill_poster', 'Poster Design', 'Poster Design', 'Generate more creative poster content, with a focus on marketing scenarios and seasonal trends', true),
('web_agent_skill_brand', 'Logo Design', 'Brand Design', 'Generate a brand logo and visual identity based on the company name, business, and target audience', true);
