(() => {
  const LAYOUT_PRESETS = {
    office: {
      id: 'office',
      blocks: { order: ['meetings','today_focus','quick_notes','resume_sessions','focus_timer','frequent_tools'], hidden: ['snippets','clipboard','browser_controls','autoplay_controls'], density: 'comfortable' },
      apps: ['gmail','drive','calendar','meet','sheets','docs','slack','teams','notion']
    },
    sales_followup: {
      id: 'sales_followup',
      blocks: { order: ['sales_followup_desk','today_focus','resume_sessions','quick_notes','meetings','focus_timer','frequent_tools'], hidden: ['snippets','clipboard','browser_controls','autoplay_controls'], density: 'comfortable' },
      apps: ['gmail','calendar','crm','linkedin','docs','sheets','drive','zoom']
    },
    marketing_research: {
      id: 'marketing_research',
      blocks: { order: ['marketing_campaign_desk','resume_sessions','quick_notes','today_focus','focus_timer','frequent_tools','meetings'], hidden: ['snippets','clipboard','browser_controls','autoplay_controls'], density: 'comfortable' },
      apps: ['analytics','search_console','google_ads','meta_business','canva','figma','docs','sheets','drive']
    },
    admin_meetings: {
      id: 'admin_meetings',
      blocks: { order: ['meetings','today_focus','quick_notes','resume_sessions','frequent_tools','focus_timer'], hidden: ['snippets','clipboard','browser_controls','autoplay_controls'], density: 'comfortable' },
      apps: ['calendar','gmail','drive','docs','sheets','forms','zoom','teams','notion']
    },
    remote_work: {
      id: 'remote_work',
      blocks: { order: ['today_focus','resume_sessions','focus_timer','quick_notes','frequent_tools','meetings'], hidden: ['snippets','clipboard','browser_controls','autoplay_controls'], density: 'comfortable' },
      apps: ['gmail','calendar','drive','docs','sheets','slack','teams','zoom','notion','asana','trello']
    },
    freelancer: {
      id: 'freelancer',
      blocks: { order: ['freelancer_projects','today_focus','deadline_radar','client_followup','quick_notes','focus_timer','frequent_tools','meetings'], hidden: ['snippets','clipboard','browser_controls','autoplay_controls'], density: 'comfortable' },
      apps: ['gmail','calendar','drive','docs','sheets','notion','trello','stripe','paypal','analytics']
    }
  };

  globalThis.OFFIQA_PRESETS = LAYOUT_PRESETS;
})();
