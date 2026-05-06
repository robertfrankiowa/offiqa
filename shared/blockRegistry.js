(() => {
  const BLOCKS = {
    meetings: { id: 'meetings', selector: '#tab-meetings', category: 'recommended', defaultEnabled: true, canHide: true, isSensitive: false },
    today_focus: { id: 'today_focus', selector: '.focus-card', category: 'recommended', defaultEnabled: true, canHide: true, isSensitive: false },
    quick_notes: { id: 'quick_notes', selector: '.note-card', category: 'recommended', defaultEnabled: true, canHide: true, isSensitive: false },
    resume_sessions: { id: 'resume_sessions', selector: '#tab-sessions', category: 'recommended', defaultEnabled: true, canHide: true, isSensitive: false },
    focus_timer: { id: 'focus_timer', selector: '#focus-timer-card', category: 'recommended', defaultEnabled: true, canHide: true, isSensitive: false },
    frequent_tools: { id: 'frequent_tools', selector: '#tab-quick-links', category: 'recommended', defaultEnabled: true, canHide: true, isSensitive: false },
    client_followup: { id: 'client_followup', selector: '#client-followup-card', category: 'optional', defaultEnabled: false, canHide: true, isSensitive: false },
    campaign_content: { id: 'campaign_content', selector: '#campaign-content-card', category: 'optional', defaultEnabled: false, canHide: true, isSensitive: false },
    design_asset: { id: 'design_asset', selector: '#design-asset-card', category: 'optional', defaultEnabled: false, canHide: true, isSensitive: false },
    freelancer_projects: { id: 'freelancer_projects', selector: '#freelancer-projects-card', category: 'expertise', defaultEnabled: false, canHide: true, isSensitive: false },
    sales_followup_desk: { id: 'sales_followup_desk', selector: '#sales-followup-desk-card', category: 'expertise', defaultEnabled: false, canHide: true, isSensitive: false },
    marketing_campaign_desk: { id: 'marketing_campaign_desk', selector: '#marketing-campaign-desk-card', category: 'expertise', defaultEnabled: false, canHide: true, isSensitive: false },
    design_review_desk: { id: 'design_review_desk', selector: '#design-review-desk-card', category: 'expertise', defaultEnabled: false, canHide: true, isSensitive: false },
    accounting_client_desk: { id: 'accounting_client_desk', selector: '#accounting-client-desk-card', category: 'expertise', defaultEnabled: false, canHide: true, isSensitive: false },
    hr_operations_desk: { id: 'hr_operations_desk', selector: '#hr-operations-desk-card', category: 'expertise', defaultEnabled: false, canHide: true, isSensitive: false },
    purchasing_operations_desk: { id: 'purchasing_operations_desk', selector: '#purchasing-operations-desk-card', category: 'expertise', defaultEnabled: false, canHide: true, isSensitive: false },
    logistics_operations_desk: { id: 'logistics_operations_desk', selector: '#logistics-operations-desk-card', category: 'expertise', defaultEnabled: false, canHide: true, isSensitive: false },
    customer_care_desk: { id: 'customer_care_desk', selector: '#customer-care-desk-card', category: 'expertise', defaultEnabled: false, canHide: true, isSensitive: false },
    rd_experiment_desk: { id: 'rd_experiment_desk', selector: '#rd-experiment-desk-card', category: 'expertise', defaultEnabled: false, canHide: true, isSensitive: false },
    developer_flow_desk: { id: 'developer_flow_desk', selector: '#developer-flow-desk-card', category: 'expertise', defaultEnabled: false, canHide: true, isSensitive: false },
    assistant_command_desk: { id: 'assistant_command_desk', selector: '#assistant-command-desk-card', category: 'expertise', defaultEnabled: false, canHide: true, isSensitive: false },
    recruiting_pipeline_desk: { id: 'recruiting_pipeline_desk', selector: '#recruiting-pipeline-desk-card', category: 'expertise', defaultEnabled: false, canHide: true, isSensitive: false },
    product_decision_desk: { id: 'product_decision_desk', selector: '#product-decision-desk-card', category: 'expertise', defaultEnabled: false, canHide: true, isSensitive: false },
    qa_release_desk: { id: 'qa_release_desk', selector: '#qa-release-desk-card', category: 'expertise', defaultEnabled: false, canHide: true, isSensitive: false },
    it_support_desk: { id: 'it_support_desk', selector: '#it-support-desk-card', category: 'expertise', defaultEnabled: false, canHide: true, isSensitive: false },
    office_operations_desk: { id: 'office_operations_desk', selector: '#office-operations-desk-card', category: 'expertise', defaultEnabled: false, canHide: true, isSensitive: false },
    teaching_operations_desk: { id: 'teaching_operations_desk', selector: '#teaching-operations-desk-card', category: 'expertise', defaultEnabled: false, canHide: true, isSensitive: false },
    student_study_desk: { id: 'student_study_desk', selector: '#student-study-desk-card', category: 'expertise', defaultEnabled: false, canHide: true, isSensitive: false },
    waiting_on: { id: 'waiting_on', selector: '#waiting-on-card', category: 'optional', defaultEnabled: false, canHide: true, isSensitive: false },
    work_requests: { id: 'work_requests', selector: '#work-requests-card', category: 'optional', defaultEnabled: false, canHide: true, isSensitive: false },
    deadline_radar: { id: 'deadline_radar', selector: '#deadline-radar-card', category: 'optional', defaultEnabled: false, canHide: true, isSensitive: false },
    routine_checklist: { id: 'routine_checklist', selector: '#routine-checklist-card', category: 'optional', defaultEnabled: false, canHide: true, isSensitive: false },
    key_links: { id: 'key_links', selector: '#key-links-card', category: 'optional', defaultEnabled: false, canHide: true, isSensitive: false },
    update_builder: { id: 'update_builder', selector: '#update-builder-card', category: 'optional', defaultEnabled: false, canHide: true, isSensitive: false },
    handoff_pack: { id: 'handoff_pack', selector: '#handoff-pack-card', category: 'optional', defaultEnabled: false, canHide: true, isSensitive: false },
    snippets: { id: 'snippets', selector: null, category: 'optional', defaultEnabled: false, canHide: true, isSensitive: false },
    clipboard: { id: 'clipboard', selector: null, category: 'optional', defaultEnabled: false, canHide: true, isSensitive: false },
    browser_controls: { id: 'browser_controls', selector: null, category: 'optional', defaultEnabled: false, canHide: true, isSensitive: false },
    autoplay_controls: { id: 'autoplay_controls', selector: null, category: 'optional', defaultEnabled: false, canHide: true, isSensitive: false }
  };

  const DEFAULT_LAYOUT = {
    order: ['meetings', 'today_focus', 'quick_notes', 'resume_sessions', 'focus_timer', 'frequent_tools'],
    hidden: ['client_followup', 'campaign_content', 'design_asset', 'freelancer_projects', 'sales_followup_desk', 'marketing_campaign_desk', 'design_review_desk',
             'accounting_client_desk', 'hr_operations_desk', 'purchasing_operations_desk', 'logistics_operations_desk', 'customer_care_desk',
             'rd_experiment_desk', 'developer_flow_desk', 'assistant_command_desk', 'recruiting_pipeline_desk', 'product_decision_desk',
             'qa_release_desk', 'it_support_desk', 'office_operations_desk', 'teaching_operations_desk', 'student_study_desk',
             'snippets', 'clipboard', 'browser_controls', 'autoplay_controls',
             'waiting_on', 'work_requests', 'deadline_radar', 'routine_checklist', 'key_links', 'update_builder', 'handoff_pack'],
    density: 'comfortable'
  };

  function sanitizeLayoutConfig(cfg) {
    const safe = { order: [], hidden: [], density: 'comfortable' };
    const known = Object.keys(BLOCKS);
    const seen = new Set();
    const order = Array.isArray(cfg && cfg.order) ? cfg.order : DEFAULT_LAYOUT.order;
    order.forEach((id) => {
      if (known.includes(id) && !seen.has(id)) { safe.order.push(id); seen.add(id); }
    });
    // Append any default block missing from order at the end (to avoid losing UI)
    DEFAULT_LAYOUT.order.forEach((id) => {
      if (!seen.has(id)) { safe.order.push(id); seen.add(id); }
    });
    const hidden = Array.isArray(cfg && cfg.hidden) ? cfg.hidden : DEFAULT_LAYOUT.hidden;
    hidden.forEach((id) => { if (known.includes(id) && !safe.hidden.includes(id)) safe.hidden.push(id); });
    known.forEach((id) => {
      const meta = BLOCKS[id];
      if (meta.defaultEnabled === false && !safe.order.includes(id) && !safe.hidden.includes(id)) {
        safe.hidden.push(id);
      }
    });
    safe.density = (cfg && cfg.density === 'compact') ? 'compact' : 'comfortable';
    return safe;
  }

  function getDefaultLayoutConfig() {
    return JSON.parse(JSON.stringify(DEFAULT_LAYOUT));
  }

  globalThis.OFFIQA_BLOCKS = BLOCKS;
  globalThis.OFFIQA_DEFAULT_LAYOUT = DEFAULT_LAYOUT;
  globalThis.OffiqaSanitizeLayout = sanitizeLayoutConfig;
  globalThis.OffiqaGetDefaultLayout = getDefaultLayoutConfig;
})();
