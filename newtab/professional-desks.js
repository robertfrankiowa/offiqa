// Professional desk blocks for sales, marketing and design.
// Storage: IndexedDB (OffiqaIDB), one key per desk.
(() => {
  const DESKS = [
    {
      prefix: 'sfd',
      cardId: 'sales-followup-desk-card',
      forceShell: true,
      title: 'Sales Follow-up Desk',
      storeKey: 'offiqa_sales_followup_desk',
      mode: 'sales',
      copyLabel: 'Copy follow-up',
      doneLabel: 'Mark done',
      dueLabel: 'follow-up',
      stuckLabel: 'deal risk',
      defaultStatus: 'due',
      namePlaceholder: 'Lead / account (vd: Acme Co)',
      contextPlaceholder: 'Pain / interest (vd: reduce onboarding time)',
      nextPlaceholder: 'Single next sales action',
      linkPlaceholder: 'Primary workspace link (optional)',
      checklistPlaceholder: 'Quick call note: recap, promised follow-up, CRM note to paste',
      statuses: [['new', 'New lead'], ['contacted', 'Contacted'], ['due', 'Follow-up due'], ['meeting', 'Meeting booked'], ['discovery', 'Discovery done'], ['proposal', 'Proposal sent'], ['negotiation', 'Negotiation'], ['closed', 'Won / Lost']],
      priorityStatuses: ['due', 'meeting', 'proposal', 'negotiation'],
      stuckStatuses: ['contacted', 'discovery', 'proposal', 'negotiation'],
      priorityTitle: 'Morning sales desk',
      stuckTitle: 'No next step / quiet leads',
      backlogTitle: 'Pipeline',
      emptyText: 'No sales follow-up items yet. Add a lead or deal to track today follow-ups, quiet leads, proposal nudges and next actions.',
      workflowLabels: ['Morning desk', 'After-call capture', 'No-next-step', 'Quiet lead'],
      extraFields: [
        { key: 'lastTouch', type: 'date', label: 'Last touch' },
        { key: 'value', type: 'number', placeholder: 'Deal value (optional)', min: '0', step: '100' },
        { key: 'objection', type: 'text', placeholder: 'Objection / blocker after call' },
        { key: 'decisionMaker', type: 'text', placeholder: 'Decision maker / buyer' },
        { key: 'crmUrl', type: 'url', placeholder: 'CRM URL' },
        { key: 'gmailUrl', type: 'url', placeholder: 'Gmail thread URL' },
        { key: 'linkedinUrl', type: 'url', placeholder: 'LinkedIn profile URL' },
        { key: 'proposalUrl', type: 'url', placeholder: 'Proposal doc URL' },
        { key: 'meetingUrl', type: 'url', placeholder: 'Meeting link' }
      ],
      snippet(item) {
        return `Hi ${item.name},\n\nJust following up on ${item.pain || item.context || 'our last conversation'}. ${item.next || 'Would it make sense to confirm the next step?'}\n\nThanks!`;
      },
      openLabel: 'Open CRM'
    },
    {
      prefix: 'mcd',
      cardId: 'marketing-campaign-desk-card',
      forceShell: true,
      title: 'Marketing Campaign Desk',
      storeKey: 'offiqa_marketing_campaign_desk',
      mode: 'marketing',
      copyLabel: 'Copy nudge',
      doneLabel: 'Mark done',
      dueLabel: 'priority',
      stuckLabel: 'approval',
      defaultStatus: 'drafting',
      namePlaceholder: 'Campaign / content (vd: Product launch email)',
      contextPlaceholder: 'Angle / context (vd: onboarding pain for SMB teams)',
      nextPlaceholder: 'Next marketing action',
      linkPlaceholder: 'Primary workspace link (optional)',
      checklistPlaceholder: 'Launch checklist, one per line: Tracking, Copy, Creative, Approval, Schedule, Publish, Measure',
      statuses: [['idea', 'Idea'], ['briefing', 'Briefing'], ['drafting', 'Drafting'], ['design', 'Design needed'], ['approval', 'Waiting approval'], ['changes', 'Changes requested'], ['scheduled', 'Scheduled'], ['published', 'Published'], ['measure', 'Measure results']],
      priorityStatuses: ['scheduled', 'published', 'measure'],
      stuckStatuses: ['approval', 'changes', 'design'],
      priorityTitle: 'Today marketing priorities',
      stuckTitle: 'Approval / asset blockers',
      backlogTitle: 'Ideas to process / campaign queue',
      emptyText: 'No marketing campaign items yet. Add a campaign, approval blocker, launch checklist or content idea.',
      workflowLabels: ['Morning check', 'Approval follow-up', 'Campaign workspace', 'Idea capture', 'Post-publish check'],
      defaultChecklist: ['Tracking', 'Copy', 'Creative', 'Approval', 'Schedule', 'Publish', 'Measure'],
      extraFields: [
        { key: 'channel', type: 'select', label: 'Channel', options: [['blog', 'Blog'], ['linkedin', 'LinkedIn / Social'], ['email', 'Email'], ['ads', 'Ads'], ['seo', 'SEO'], ['landing', 'Landing page'], ['video', 'Video'], ['other', 'Other']] },
        { key: 'ownerBlocker', type: 'text', placeholder: 'Owner / blocker (vd: founder approval, designer)' },
        { key: 'waitingSince', type: 'date', label: 'Waiting since' },
        { key: 'metricToCheck', type: 'text', placeholder: 'Metric to check (CTR, leads, clicks, rankings)' },
        { key: 'metricDue', type: 'date', label: 'Metric check due' },
        { key: 'sourceUrl', type: 'url', placeholder: 'Idea source / current research link' },
        { key: 'briefUrl', type: 'url', placeholder: 'Brief / Docs URL' },
        { key: 'calendarUrl', type: 'url', placeholder: 'Content calendar URL' },
        { key: 'driveUrl', type: 'url', placeholder: 'Drive folder URL' },
        { key: 'designUrl', type: 'url', placeholder: 'Canva / Figma URL' },
        { key: 'adsUrl', type: 'url', placeholder: 'Ads Manager URL' },
        { key: 'analyticsUrl', type: 'url', placeholder: 'GA4 / Search Console URL' },
        { key: 'landingUrl', type: 'url', placeholder: 'Landing page URL' },
        { key: 'slackUrl', type: 'url', placeholder: 'Slack thread URL' },
        { key: 'researchUrl', type: 'url', placeholder: 'Competitor research URL' }
      ],
      snippet(item) {
        return `Quick follow-up on ${item.name}. Are we good to move forward, or is there anything you want changed before scheduling?`;
      },
      openLabel: 'Open workspace'
    },
    {
      prefix: 'drd',
      cardId: 'design-review-desk-card',
      forceShell: true,
      title: 'Design Review Desk',
      storeKey: 'offiqa_design_review_desk',
      doneLabel: 'Mark done',
      dueLabel: 'today',
      stuckLabel: 'stuck',
      mode: 'design',
      namePlaceholder: 'Design project (vd: SaaS landing page)',
      contextPlaceholder: 'Feedback summary (vd: Logo feels too corporate)',
      nextPlaceholder: 'Next design action',
      linkPlaceholder: 'Primary design workspace link',
      checklistPlaceholder: 'Handoff checklist, one per line: Main file, Prototype, Component notes, Spacing/layout notes, Assets exported, Edge states, Responsive notes, Open questions',
      statuses: [['briefing', 'Briefing'], ['designing', 'Designing'], ['internal', 'Internal review'], ['feedback', 'Waiting feedback'], ['changes', 'Changes requested'], ['approval', 'Waiting approval'], ['handoff', 'Ready for handoff'], ['approved', 'Approved / Done'], ['due', 'Review today']],
      defaultStatus: 'due',
      priorityStatuses: ['due', 'changes', 'handoff'],
      stuckStatuses: ['feedback', 'approval'],
      priorityTitle: 'Review / handoff',
      stuckTitle: 'Feedback / approval stuck',
      backlogTitle: 'Design queue',
      emptyText: 'No design review items yet. Add feedback, revision control, approval nudges or handoff checklist items.',
      workflowLabels: ['Morning desk', 'Feedback capture', 'Revision control', 'Approval nudge', 'Handoff checklist'],
      defaultChecklist: ['Main file link', 'Prototype link', 'Component notes', 'Spacing/layout notes', 'Assets exported', 'Edge states', 'Responsive notes', 'Open questions'],
      extraFields: [
        { key: 'source', type: 'select', label: 'Source', options: [['figma', 'Figma'], ['slack', 'Slack'], ['email', 'Email'], ['call', 'Call'], ['docs', 'Docs'], ['meeting', 'Meeting'], ['client', 'Client note'], ['internal', 'Internal']] },
        { key: 'feedbackType', type: 'select', label: 'Feedback type', options: [['visual', 'Visual'], ['copy', 'Copy'], ['layout', 'Layout'], ['brand', 'Brand'], ['ux', 'UX'], ['content', 'Content'], ['technical', 'Technical'], ['handoff', 'Handoff']] },
        { key: 'feedbackStatus', type: 'select', label: 'Feedback status', options: [['new', 'New'], ['clarify', 'Clarify'], ['accepted', 'Accepted'], ['rejected', 'Rejected'], ['done', 'Done'], ['scope', 'Out of scope']] },
        { key: 'intent', type: 'text', placeholder: 'Intent / problem to solve (readability, brand fit, conversion...)' },
        { key: 'version', type: 'text', placeholder: 'Version (vd: v2, final, handoff)' },
        { key: 'currentRevision', type: 'number', label: 'Revision', min: '0', step: '1' },
        { key: 'revisionLimit', type: 'number', label: 'Limit', min: '1', step: '1' },
        { key: 'waitingSince', type: 'date', label: 'Waiting since' },
        { key: 'figmaUrl', type: 'url', placeholder: 'Figma URL' },
        { key: 'canvaUrl', type: 'url', placeholder: 'Canva URL' },
        { key: 'adobeUrl', type: 'url', placeholder: 'Adobe / Framer / Webflow URL' },
        { key: 'briefUrl', type: 'url', placeholder: 'Brief / Notion / Docs URL' },
        { key: 'brandUrl', type: 'url', placeholder: 'Brand guideline URL' },
        { key: 'assetUrl', type: 'url', placeholder: 'Asset folder / Drive URL' },
        { key: 'moodboardUrl', type: 'url', placeholder: 'Inspiration / moodboard URL' },
        { key: 'feedbackUrl', type: 'url', placeholder: 'Feedback thread / comment URL' },
        { key: 'handoffUrl', type: 'url', placeholder: 'Handoff doc / dev ticket URL' },
        { key: 'clientThreadUrl', type: 'url', placeholder: 'Client email / Slack thread URL' }
      ],
      openLabel: 'Open design'
    },
    {
      prefix: 'acd',
      cardId: 'accounting-client-desk-card',
      title: 'Accounting Client Desk',
      storeKey: 'offiqa_accounting_client_desk',
      mode: 'accounting',
      copyLabel: 'Copy client reminder',
      doneLabel: 'Archive',
      dueLabel: 'deadline',
      stuckLabel: 'waiting client',
      defaultStatus: 'collecting',
      namePlaceholder: 'Client / entity (vd: Client A)',
      contextPlaceholder: 'Missing docs / client questions summary',
      nextPlaceholder: 'Next accounting action',
      linkPlaceholder: 'Primary accounting workspace link',
      checklistPlaceholder: 'Missing docs / close checklist: bank statement, receipts, uncategorized questions, payroll, reports',
      statuses: [['collecting', 'Collecting docs'], ['waiting', 'Waiting client'], ['info', 'Need more info'], ['progress', 'In progress'], ['review', 'Ready for review'], ['ready', 'Ready to file/send'], ['filed', 'Filed/Sent'], ['done', 'Done/Archived'], ['due', 'Due soon']],
      priorityStatuses: ['due', 'review', 'ready'],
      stuckStatuses: ['waiting', 'info'],
      priorityTitle: 'Today / deadline risk',
      stuckTitle: 'Waiting / need info',
      backlogTitle: 'Client work',
      emptyText: 'No accounting client work yet. Add a client to track missing docs, client answers, deadlines and workspace links.',
      workflowLabels: ['Morning check', 'Document chase', 'Need answers', 'Month-end close', 'Tax triage'],
      defaultCloseChecklist: ['Bank feed reviewed', 'Bank reconciliation', 'Credit card reconciliation', 'Receipts matched', 'Uncategorized cleared', 'Payroll posted', 'AR/AP reviewed', 'Reports generated'],
      extraFields: [
        { key: 'workType', type: 'select', label: 'Work type', options: [['tax_return', 'Tax return'], ['monthly_close', 'Monthly close'], ['bookkeeping', 'Bookkeeping'], ['payroll', 'Payroll'], ['sales_tax', 'Sales tax/VAT'], ['cleanup', 'Cleanup'], ['reporting', 'Client report'], ['review', 'Internal review']] },
        { key: 'period', type: 'text', placeholder: 'Period (Jan 2026, Q1 2026, Tax Year 2025)' },
        { key: 'waitingSince', type: 'date', label: 'Waiting since' },
        { key: 'lastReminder', type: 'date', label: 'Last reminder' },
        { key: 'questionCount', type: 'number', placeholder: 'Open client questions', min: '0', step: '1' },
        { key: 'receiptCount', type: 'number', placeholder: 'Missing receipts', min: '0', step: '1' },
        { key: 'qboUrl', type: 'url', placeholder: 'QBO URL' },
        { key: 'xeroUrl', type: 'url', placeholder: 'Xero URL' },
        { key: 'driveUrl', type: 'url', placeholder: 'Drive folder URL' },
        { key: 'portalUrl', type: 'url', placeholder: 'Client portal URL' },
        { key: 'emailUrl', type: 'url', placeholder: 'Email thread URL' },
        { key: 'taxUrl', type: 'url', placeholder: 'Tax software URL' }
      ],
      openLabel: 'Open accounting',
      snippet(item) {
        return `Hi ${item.name},\n\nQuick reminder that we are still missing: ${item.context || 'the requested documents'}. Once we have these, we can continue with ${item.next || 'the current work'}.\n\nThanks!`;
      }
    },
    {
      prefix: 'hod',
      cardId: 'hr-operations-desk-card',
      title: 'HR Operations Desk',
      storeKey: 'offiqa_hr_operations_desk',
      mode: 'hr',
      copyLabel: 'Copy HR reminder',
      doneLabel: 'Complete',
      dueLabel: 'today',
      stuckLabel: 'waiting',
      defaultStatus: 'due',
      doneStatuses: ['done', 'completed', 'benefits_complete'],
      namePlaceholder: 'Employee / new hire / request (vd: Jane Nguyen)',
      contextPlaceholder: 'Missing item / request summary',
      nextPlaceholder: 'Next HR action',
      linkPlaceholder: 'Primary HR workspace link',
      checklistPlaceholder: 'Checklist / missing items: paperwork, IT setup, manager task, payroll, benefits, access/equipment',
      statuses: [['due', 'Due today'], ['offer', 'Offer accepted'], ['paperwork', 'Paperwork pending'], ['waiting_employee', 'Waiting employee'], ['waiting_manager', 'Waiting manager'], ['waiting_it', 'Waiting IT'], ['ready_day1', 'Ready for day 1'], ['request_new', 'New employee request'], ['request_progress', 'Request in progress'], ['waiting_vendor', 'Waiting vendor/system'], ['leave_pending', 'Leave pending docs'], ['leave_approved', 'Leave approved'], ['returning_soon', 'Returning soon'], ['benefits_not_started', 'Benefits not started'], ['benefits_progress', 'Benefits in progress'], ['benefits_docs', 'Benefits need docs'], ['reminder_sent', 'Reminder sent'], ['benefits_complete', 'Benefits completed'], ['offboarding_notice', 'Notice received'], ['offboarding_open', 'Offboarding checklist open'], ['offboarding_waiting', 'Waiting manager/IT/payroll'], ['access_equipment', 'Access/equipment pending'], ['final_items', 'Final items pending'], ['completed', 'Completed']],
      priorityStatuses: ['due', 'paperwork', 'ready_day1', 'returning_soon', 'benefits_not_started', 'benefits_progress', 'offboarding_open', 'access_equipment', 'final_items'],
      stuckStatuses: ['waiting_employee', 'waiting_manager', 'waiting_it', 'waiting_vendor', 'leave_pending', 'benefits_docs', 'offboarding_waiting'],
      priorityTitle: 'Today / HR risk',
      stuckTitle: 'Waiting / blockers',
      backlogTitle: 'HR queue',
      emptyText: 'No HR workflow yet. Add onboarding, employee requests, benefits, leave or offboarding items.',
      workflowLabels: ['Morning HR check', 'New hire docs', 'Manager / IT blocker', 'Employee requests', 'Offboarding checklist'],
      defaultChecklist: ['Paperwork', 'IT setup', 'Manager task', 'Payroll', 'Benefits', 'Access/equipment'],
      extraFields: [
        { key: 'workflowType', type: 'select', label: 'Workflow', options: [['onboarding', 'Onboarding'], ['request', 'Employee request'], ['offboarding', 'Offboarding'], ['benefits', 'Benefits enrollment'], ['leave', 'Leave/PTO']] },
        { key: 'role', type: 'text', placeholder: 'Role / team (vd: Marketing Assistant)' },
        { key: 'startDate', type: 'date', label: 'Start date' },
        { key: 'lastDay', type: 'date', label: 'Last day' },
        { key: 'requestType', type: 'select', label: 'Request type', options: [['pto', 'PTO balance'], ['employment_verification', 'Employment verification'], ['benefits_question', 'Benefits question'], ['payroll_correction', 'Payroll correction'], ['address_change', 'Address change'], ['document_request', 'Document request'], ['policy_question', 'Policy question'], ['leave_request', 'Leave request'], ['badge_access', 'Badge/access issue'], ['other', 'Other']] },
        { key: 'leaveType', type: 'select', label: 'Leave type', options: [['pto', 'PTO'], ['loa', 'LOA'], ['fmla', 'FMLA'], ['sick', 'Sick leave'], ['parental', 'Parental leave'], ['other', 'Other']] },
        { key: 'leaveStart', type: 'date', label: 'Leave start' },
        { key: 'leaveEnd', type: 'date', label: 'Leave end' },
        { key: 'returnDate', type: 'date', label: 'Return date' },
        { key: 'benefitDeadline', type: 'date', label: 'Benefit deadline' },
        { key: 'waitingOn', type: 'select', label: 'Waiting on', options: [['employee', 'Employee'], ['manager', 'Manager'], ['it', 'IT'], ['payroll', 'Payroll'], ['benefits', 'Benefits'], ['vendor', 'Vendor/system'], ['hr', 'HR'], ['none', 'None']] },
        { key: 'missingItems', type: 'text', placeholder: 'Missing items (I-9 docs, direct deposit, laptop return...)' },
        { key: 'blocker', type: 'text', placeholder: 'Blocker / risk (manager plan, IT account, payroll notice...)' },
        { key: 'waitingSince', type: 'date', label: 'Waiting since' },
        { key: 'lastReminder', type: 'date', label: 'Last reminder' },
        { key: 'hrisUrl', type: 'url', placeholder: 'HRIS URL' },
        { key: 'driveUrl', type: 'url', placeholder: 'Drive folder URL' },
        { key: 'payrollUrl', type: 'url', placeholder: 'Payroll system URL' },
        { key: 'emailUrl', type: 'url', placeholder: 'Email thread URL' },
        { key: 'itTicketUrl', type: 'url', placeholder: 'IT ticket URL' },
        { key: 'benefitsUrl', type: 'url', placeholder: 'Benefits portal URL' },
        { key: 'offerUrl', type: 'url', placeholder: 'Offer letter URL' },
        { key: 'checklistUrl', type: 'url', placeholder: 'Official checklist / tracker URL' }
      ],
      openLabel: 'Open HR workspace',
      snippet(item) {
        return `Hi ${item.name},\n\nQuick reminder that we still need ${item.context || 'the pending item'} for this HR workflow. The next step is ${item.next || 'to confirm the missing information'}.\n\nThank you!`;
      }
    },
    {
      prefix: 'pod',
      cardId: 'purchasing-operations-desk-card',
      title: 'Purchasing Operations Desk',
      storeKey: 'offiqa_purchasing_operations_desk',
      mode: 'purchasing',
      copyLabel: 'Copy vendor follow-up',
      doneLabel: 'Close',
      dueLabel: 'risk',
      stuckLabel: 'waiting',
      defaultStatus: 'request',
      namePlaceholder: 'Request / PO / RFQ (vd: PO-1042)',
      contextPlaceholder: 'Missing info / issue / blocker',
      nextPlaceholder: 'Next purchasing action',
      linkPlaceholder: 'Primary ERP / PO / vendor email / quote link',
      checklistPlaceholder: 'PO / purchasing checklist: quote, approval, PO ack, ETA, receiving, invoice match, contract renewal',
      statuses: [
        ['request', 'New request'], ['missing', 'Missing info'], ['sourcing', 'Sourcing / RFQ'], ['quote_requested', 'Quote requested'], ['quote_received', 'Quote received'], ['quote_clarify', 'Need clarification'], ['under_review', 'Under review'], ['selected', 'Selected'],
        ['approval', 'Waiting approval'], ['approved', 'Approved'], ['po', 'PO issued'], ['po_sent', 'PO sent'], ['vendor', 'Waiting supplier confirmation'], ['confirmed', 'Confirmed'], ['delivery', 'Delivery pending'], ['partial', 'Partially delivered'], ['delivered', 'Delivered'],
        ['receipt', 'Receipt pending'], ['invoice', 'Invoice issue'], ['renewal', 'Contract renewal'], ['risk', 'Supplier risk'], ['ready_close', 'Ready to close'], ['closed', 'Closed'], ['due', 'Due today']
      ],
      priorityStatuses: ['due', 'delivery', 'partial', 'invoice', 'renewal', 'risk', 'ready_close'],
      stuckStatuses: ['vendor', 'approval', 'missing', 'quote_requested', 'quote_clarify', 'receipt'],
      priorityTitle: 'Today / purchasing risk',
      stuckTitle: 'Waiting / blockers',
      backlogTitle: 'Purchasing queue',
      emptyText: 'No purchasing items yet. Add PO follow-ups, vendor quotes, approvals or delivery risks.',
      workflowLabels: ['Morning desk', 'PO acknowledgement', 'Approval blocker', 'Quote tracker', 'Delivery issue', 'Renewal risk'],
      defaultChecklist: ['Request info complete', 'Quote received', 'Approval clear', 'PO sent', 'Supplier acknowledged', 'ETA confirmed', 'Receiving checked', 'Invoice matched'],
      extraFields: [
        { key: 'purchasingType', type: 'select', label: 'Workflow', options: [['pr', 'Purchase request'], ['po', 'PO / supplier'], ['quote', 'Quote / RFQ'], ['delivery', 'Delivery / receipt'], ['invoice', 'Invoice mismatch'], ['contract', 'Contract / renewal'], ['vendor', 'Vendor issue']] },
        { key: 'requester', type: 'text', placeholder: 'Requester' },
        { key: 'department', type: 'text', placeholder: 'Department / cost center' },
        { key: 'poNumber', type: 'text', placeholder: 'PO number' },
        { key: 'supplier', type: 'text', placeholder: 'Supplier / vendor' },
        { key: 'sentDate', type: 'date', label: 'Sent date' },
        { key: 'ackStatus', type: 'select', label: 'PO ack', options: [['unknown', 'Ack unknown'], ['not_ack', 'Not acknowledged'], ['ack', 'Acknowledged']] },
        { key: 'etaDate', type: 'date', label: 'Confirmed ETA' },
        { key: 'lastFollowup', type: 'date', label: 'Last follow-up' },
        { key: 'approver', type: 'text', placeholder: 'Approver / approval owner' },
        { key: 'waitingSince', type: 'date', label: 'Waiting since' },
        { key: 'quoteRequested', type: 'number', placeholder: 'Quotes requested', min: '0', step: '1' },
        { key: 'quoteReceived', type: 'number', placeholder: 'Quotes received', min: '0', step: '1' },
        { key: 'quoteMissing', type: 'text', placeholder: 'Missing quote details: freight, lead time, MOQ, terms' },
        { key: 'issueType', type: 'select', label: 'Issue', options: [['', 'No issue'], ['qty', 'Qty mismatch'], ['price', 'Price mismatch'], ['freight', 'Freight mismatch'], ['receipt', 'No receipt'], ['wrong_item', 'Wrong item'], ['late', 'Late delivery'], ['cert', 'Certification missing']] },
        { key: 'renewalDate', type: 'date', label: 'Renewal date' },
        { key: 'renewalWindow', type: 'number', placeholder: 'Notice window days', min: '0', step: '1' },
        { key: 'waitOn', type: 'select', label: 'Waiting on', options: [['supplier', 'Supplier'], ['requester', 'Requester'], ['approver', 'Approver'], ['warehouse', 'Warehouse/receiving'], ['ap', 'Finance/AP'], ['legal', 'Legal/risk'], ['internal', 'Internal team']] },
        { key: 'erpUrl', type: 'url', placeholder: 'ERP / procurement URL' },
        { key: 'emailUrl', type: 'url', placeholder: 'Email thread URL' },
        { key: 'portalUrl', type: 'url', placeholder: 'Supplier portal URL' },
        { key: 'quoteFolderUrl', type: 'url', placeholder: 'Quote folder URL' },
        { key: 'contractUrl', type: 'url', placeholder: 'Contract URL' },
        { key: 'invoiceUrl', type: 'url', placeholder: 'Invoice / AP URL' }
      ],
      openLabel: 'Open PO',
      snippet(item) {
        return `Hi ${item.name},\n\nQuick follow-up on ${item.context || 'this purchasing item'}. Could you confirm the next update so we can keep ${item.next || 'the request'} moving?`;
      }
    },
    {
      prefix: 'lod',
      cardId: 'logistics-operations-desk-card',
      title: 'Logistics Operations Desk',
      storeKey: 'offiqa_logistics_operations_desk',
      copyLabel: 'Copy shipment update',
      doneLabel: 'Mark moved',
      dueLabel: 'shipment',
      stuckLabel: 'exception',
      namePlaceholder: 'Shipment / order / carrier (vd: Order 3842)',
      contextPlaceholder: 'Route / issue (vd: Carrier delay - missing POD)',
      nextPlaceholder: 'Next logistics action',
      linkPlaceholder: 'TMS / WMS / carrier / tracking / email link',
      checklistPlaceholder: 'Shipment checklist: tracking, BOL/POD, customs, receiving, carrier update, exception note',
      statuses: [['due', 'Due today'], ['exception', 'Exception'], ['waiting', 'Waiting carrier'], ['receiving', 'Receiving'], ['customs', 'Customs/docs'], ['delayed', 'Delayed'], ['delivered', 'Delivered'], ['closed', 'Closed']],
      priorityStatuses: ['due', 'exception', 'receiving'],
      stuckStatuses: ['waiting', 'exception'],
      priorityTitle: 'Today / exceptions',
      stuckTitle: 'Waiting carrier',
      backlogTitle: 'Shipment queue',
      emptyText: 'No logistics items yet. Add shipments, receiving tasks, carrier follow-ups or exceptions.',
      openLabel: 'Open shipment',
      snippet(item) {
        return `Quick update request for ${item.name}: could you confirm ${item.context || 'the current shipment status'}? Next step on our side is ${item.next || 'to update the receiving plan'}.`;
      }
    },
    {
      prefix: 'ccd',
      cardId: 'customer-care-desk-card',
      title: 'Customer Care Desk',
      storeKey: 'offiqa_customer_care_desk',
      copyLabel: 'Copy customer reply',
      doneLabel: 'Mark handled',
      dueLabel: 'customer',
      stuckLabel: 'at risk',
      namePlaceholder: 'Customer / account (vd: Acme Support)',
      contextPlaceholder: 'Issue / health signal (vd: Renewal concern - onboarding blocked)',
      nextPlaceholder: 'Next customer action',
      linkPlaceholder: 'CRM / support ticket / email / account link',
      checklistPlaceholder: 'Care checklist: ticket link, customer ask, promised update, renewal risk, owner, next touch',
      statuses: [['new', 'New request'], ['due', 'Due today'], ['sla', 'SLA risk'], ['risk', 'Account risk'], ['escalated', 'Escalated'], ['waiting', 'Waiting customer'], ['internal', 'Waiting internal'], ['onboarding', 'Onboarding milestone'], ['success', 'Success check'], ['resolved', 'Resolved'], ['closed', 'Closed']],
      priorityStatuses: ['due', 'sla', 'risk', 'escalated'],
      stuckStatuses: ['waiting', 'internal', 'risk', 'escalated'],
      priorityTitle: 'Today / account risk',
      stuckTitle: 'Waiting / at risk',
      backlogTitle: 'Care queue',
      emptyText: 'No customer care items yet. Add customer follow-ups, account risks, tickets or success checks.',
      openLabel: 'Open customer',
      snippet(item) {
        return `Hi ${item.name},\n\nI wanted to follow up on ${item.context || 'your request'}. The next step is ${item.next || 'to confirm whether this is now resolved'}.\n\nThanks!`;
      }
    },
    {
      prefix: 'red',
      cardId: 'rd-experiment-desk-card',
      title: 'R&D Experiment Desk',
      storeKey: 'offiqa_rd_experiment_desk',
      copyLabel: 'Copy experiment note',
      doneLabel: 'Mark logged',
      dueLabel: 'experiment',
      stuckLabel: 'blocked',
      namePlaceholder: 'Experiment / prototype (vd: Formula B test)',
      contextPlaceholder: 'Hypothesis / blocker (vd: Waiting lab result)',
      nextPlaceholder: 'Next research action',
      linkPlaceholder: 'Lab notes / Drive / spec / ticket link',
      checklistPlaceholder: 'Experiment checklist: hypothesis, setup, sample, result, metric, next iteration, log link',
      statuses: [['idea', 'Idea'], ['planned', 'Planned'], ['due', 'Run/check today'], ['ready_test', 'Ready to test'], ['running', 'Running'], ['tested', 'Tested'], ['decision', 'Decision pending'], ['blocked', 'Blocked'], ['review', 'Review result'], ['prototype', 'Prototype/handoff'], ['logged', 'Logged']],
      priorityStatuses: ['due', 'ready_test', 'review', 'decision'],
      stuckStatuses: ['blocked', 'decision'],
      priorityTitle: 'Run / review',
      stuckTitle: 'Blocked experiments',
      backlogTitle: 'R&D queue',
      emptyText: 'No R&D items yet. Add experiments, prototypes, results to review or blockers.',
      openLabel: 'Open research',
      snippet(item) {
        return `Experiment note for ${item.name}\nContext: ${item.context || 'TBD'}\nNext action: ${item.next || 'Review and log the next step'}`;
      }
    },
    {
      prefix: 'dfd',
      cardId: 'developer-flow-desk-card',
      title: 'Developer Flow Desk',
      storeKey: 'offiqa_developer_flow_desk',
      mode: 'developer',
      copyLabel: 'Copy dev update',
      doneLabel: 'Archive',
      dueLabel: 'flow risk',
      stuckLabel: 'blocked',
      defaultStatus: 'planned',
      namePlaceholder: 'Ticket / PR / incident (vd: OFFIQA-128)',
      contextPlaceholder: 'Blocker / failing test / issue summary',
      nextPlaceholder: 'Next dev action',
      linkPlaceholder: 'Primary repo / PR / ticket / CI / logs URL',
      checklistPlaceholder: 'Release/debug checklist: CI green, migration, env, feature flag, rollback, smoke test, docs',
      statuses: [
        ['planned', 'Planned'], ['clarify', 'Clarification needed'], ['ready', 'Ready to code'], ['coding', 'Coding'], ['blocked', 'Blocked'], ['pr_open', 'PR open'], ['changes', 'Changes requested'], ['ci_failed', 'CI failed'], ['qa', 'QA needed'], ['release', 'Ready to deploy'], ['incident', 'Production/admin issue'], ['env_issue', 'Env issue'], ['docs', 'Docs pending'], ['done', 'Done / Archived']
      ],
      priorityStatuses: ['incident', 'ci_failed', 'release', 'blocked', 'pr_open'],
      stuckStatuses: ['blocked', 'clarify', 'pr_open', 'changes', 'ci_failed', 'env_issue'],
      priorityTitle: 'Today / flow risk',
      stuckTitle: 'Blocked / waiting',
      backlogTitle: 'Dev queue',
      emptyText: 'No developer flow items yet. Add issues, PRs, bugs, reviews or release tasks.',
      workflowLabels: ['Morning flow', 'Resume coding', 'PR review', 'CI triage', 'Release checklist', 'Admin issue'],
      defaultChecklist: ['CI green', 'Migration checked', 'Env variables checked', 'Feature flag checked', 'Rollback note ready', 'Smoke test done', 'Monitoring/logs checked', 'Docs updated'],
      extraFields: [
        { key: 'devType', type: 'select', label: 'Workflow', options: [['feature', 'Feature ticket'], ['bug', 'Bug'], ['pr', 'PR review'], ['ci', 'CI/build failure'], ['release', 'Release/deploy'], ['incident', 'Production/admin issue'], ['env', 'Env/local setup'], ['docs', 'Docs/runbook']] },
        { key: 'repo', type: 'text', placeholder: 'Repo / project' },
        { key: 'branch', type: 'text', placeholder: 'Branch' },
        { key: 'resumeNote', type: 'text', placeholder: 'Resume note: next file/test/thought' },
        { key: 'blockerType', type: 'select', label: 'Blocker', options: [['', 'No blocker'], ['spec', 'Spec/acceptance criteria'], ['review', 'Review'], ['env', 'Env/local setup'], ['access', 'Access/token'], ['api', 'API contract'], ['design', 'Design'], ['test_data', 'Test data'], ['ci', 'CI/build'], ['prod', 'Production issue']] },
        { key: 'waitingSince', type: 'date', label: 'Waiting since' },
        { key: 'lastActivity', type: 'date', label: 'Last activity' },
        { key: 'reviewer', type: 'text', placeholder: 'Reviewer / owner' },
        { key: 'prStatus', type: 'select', label: 'PR status', options: [['', 'No PR'], ['waiting', 'Waiting review'], ['changes', 'Changes requested'], ['approved', 'Approved'], ['ready_merge', 'Ready merge'], ['stale', 'Stale'], ['need_review', 'Need to review']] },
        { key: 'ciType', type: 'select', label: 'CI type', options: [['', 'No CI issue'], ['test', 'Test failed'], ['build', 'Build failed'], ['lint', 'Lint failed'], ['deploy', 'Deploy failed'], ['flaky', 'Flaky suspected'], ['config', 'Config/infra']] },
        { key: 'ciLastRun', type: 'date', label: 'CI last run' },
        { key: 'suspectedCause', type: 'text', placeholder: 'Suspected cause / failing test' },
        { key: 'risk', type: 'select', label: 'Risk', options: [['', 'No risk'], ['prod', 'Production active'], ['user_blocked', 'User blocked'], ['data', 'Data risk'], ['release', 'Release blocking'], ['perf', 'Performance'], ['cosmetic', 'Cosmetic']] },
        { key: 'module', type: 'text', placeholder: 'Module: auth, billing, import, roles, dashboard' },
        { key: 'environment', type: 'select', label: 'Environment', options: [['local', 'Local'], ['staging', 'Staging'], ['production', 'Production'], ['mobile', 'Mobile build'], ['admin', 'Admin/internal']] },
        { key: 'githubUrl', type: 'url', placeholder: 'GitHub / GitLab URL' },
        { key: 'ticketUrl', type: 'url', placeholder: 'Jira / Linear / ticket URL' },
        { key: 'prUrl', type: 'url', placeholder: 'PR / MR URL' },
        { key: 'ciUrl', type: 'url', placeholder: 'CI run URL' },
        { key: 'docsUrl', type: 'url', placeholder: 'Docs / runbook URL' },
        { key: 'logsUrl', type: 'url', placeholder: 'Logs / Sentry / Grafana URL' },
        { key: 'stagingUrl', type: 'url', placeholder: 'Staging / admin URL' },
        { key: 'designUrl', type: 'url', placeholder: 'Design / spec URL' }
      ],
      openLabel: 'Open dev link',
      snippet(item) {
        return `Dev update: ${item.name}\nStatus/context: ${item.context || 'in progress'}\nNext: ${item.next || 'continue implementation and verify'}`;
      }
    },
    {
      prefix: 'cmd',
      cardId: 'assistant-command-desk-card',
      title: 'Assistant Command Desk',
      storeKey: 'offiqa_assistant_command_desk',
      copyLabel: 'Copy assistant note',
      doneLabel: 'Mark handled',
      dueLabel: 'request',
      stuckLabel: 'waiting',
      namePlaceholder: 'Executive / request / meeting (vd: CEO travel)',
      contextPlaceholder: 'Context / blocker (vd: Waiting itinerary approval)',
      nextPlaceholder: 'Next assistant action',
      linkPlaceholder: 'Calendar / email / docs / travel / CRM link',
      checklistPlaceholder: 'Assistant checklist: calendar, brief, travel, docs, email, stakeholder, pending reply',
      statuses: [['request', 'New request'], ['due', 'Due today'], ['waiting', 'Waiting reply'], ['meeting', 'Meeting prep'], ['travel', 'Travel'], ['briefing', 'Briefing'], ['done', 'Done']],
      priorityStatuses: ['due', 'meeting', 'travel'],
      stuckStatuses: ['waiting'],
      priorityTitle: 'Today / prep',
      stuckTitle: 'Waiting reply',
      backlogTitle: 'Assistant queue',
      emptyText: 'No assistant command items yet. Add executive requests, meeting prep, travel or follow-ups.',
      openLabel: 'Open workspace',
      snippet(item) {
        return `Quick update on ${item.name}: ${item.context || 'this item is in progress'}. Next step: ${item.next || 'confirm and complete the request'}.`;
      }
    },
    {
      prefix: 'rpd',
      cardId: 'recruiting-pipeline-desk-card',
      title: 'Recruiting Pipeline Desk',
      storeKey: 'offiqa_recruiting_pipeline_desk',
      copyLabel: 'Copy candidate follow-up',
      doneLabel: 'Mark moved',
      dueLabel: 'candidate',
      stuckLabel: 'waiting',
      namePlaceholder: 'Candidate / role (vd: Alex - Product Designer)',
      contextPlaceholder: 'Stage / blocker (vd: Hiring manager feedback pending)',
      nextPlaceholder: 'Next recruiting action',
      linkPlaceholder: 'ATS / LinkedIn / email / resume / interview link',
      checklistPlaceholder: 'Candidate checklist: resume, source, stage, interview, feedback, next touch, offer docs',
      statuses: [['sourced', 'Sourced'], ['screen', 'Screen'], ['interview', 'Interview'], ['candidate', 'Waiting candidate'], ['manager', 'Waiting manager'], ['offer', 'Offer'], ['rejected', 'Rejected'], ['hired', 'Hired'], ['due', 'Due today']],
      priorityStatuses: ['due', 'interview'],
      stuckStatuses: ['candidate', 'manager'],
      priorityTitle: 'Today / interviews',
      stuckTitle: 'Waiting candidate / manager',
      backlogTitle: 'Pipeline',
      emptyText: 'No recruiting items yet. Add candidates, interview prep, manager feedback or follow-ups.',
      openLabel: 'Open candidate',
      snippet(item) {
        return `Hi ${item.name},\n\nQuick follow-up on ${item.context || 'your interview process'}. The next step is ${item.next || 'to confirm timing and next steps'}.\n\nThanks!`;
      }
    },
    {
      prefix: 'pdd',
      cardId: 'product-decision-desk-card',
      title: 'Product Decision Desk',
      storeKey: 'offiqa_product_decision_desk',
      copyLabel: 'Copy product update',
      doneLabel: 'Mark decided',
      dueLabel: 'decision',
      stuckLabel: 'open question',
      namePlaceholder: 'Feature / decision / launch (vd: Onboarding v2)',
      contextPlaceholder: 'Signal / blocker (vd: Waiting analytics + CS feedback)',
      nextPlaceholder: 'Next product action',
      linkPlaceholder: 'Linear / Jira / doc / analytics / customer feedback link',
      checklistPlaceholder: 'Product checklist: decision, evidence, customers, analytics, owner, launch step, open question',
      statuses: [['open', 'Open'], ['input', 'Needs input'], ['research', 'Research'], ['blocked', 'Blocked'], ['decision', 'Decision needed'], ['due', 'Decide today'], ['decided', 'Decided'], ['revisited', 'Revisit'], ['launch', 'Launch'], ['measure', 'Measure'], ['done', 'Done']],
      priorityStatuses: ['due', 'decision', 'input', 'launch'],
      stuckStatuses: ['blocked', 'input'],
      priorityTitle: 'Decisions / launch',
      stuckTitle: 'Blocked decisions',
      backlogTitle: 'Product queue',
      emptyText: 'No product decision items yet. Add decisions, research, launch tasks or open questions.',
      openLabel: 'Open product',
      snippet(item) {
        return `Product update: ${item.name}\nContext: ${item.context || 'decision pending'}\nNext: ${item.next || 'review inputs and choose the next step'}`;
      }
    },
    {
      prefix: 'qrd',
      cardId: 'qa-release-desk-card',
      title: 'QA Release Desk',
      storeKey: 'offiqa_qa_release_desk',
      copyLabel: 'Copy QA update',
      doneLabel: 'Mark passed',
      dueLabel: 'test',
      stuckLabel: 'bug/blocker',
      namePlaceholder: 'Release / test / bug (vd: v1.2 smoke test)',
      contextPlaceholder: 'Area / blocker (vd: Checkout regression)',
      nextPlaceholder: 'Next QA action',
      linkPlaceholder: 'Test plan / bug / PR / staging link',
      checklistPlaceholder: 'QA checklist: test plan, environment, smoke, regression, bug link, release gate',
      statuses: [['plan', 'Test plan'], ['due', 'Test today'], ['running', 'Regression in progress'], ['retest', 'Ready for retest'], ['blocked', 'Blocked'], ['bug', 'Bug found'], ['failed', 'Failed'], ['release', 'Release check'], ['passed', 'Passed']],
      priorityStatuses: ['due', 'retest', 'release'],
      stuckStatuses: ['blocked', 'bug', 'failed'],
      priorityTitle: 'Test / release',
      stuckTitle: 'Bugs / blockers',
      backlogTitle: 'QA queue',
      emptyText: 'No QA release items yet. Add test runs, bugs, blockers or release checks.',
      openLabel: 'Open QA link',
      snippet(item) {
        return `QA update: ${item.name}\nArea/context: ${item.context || 'test in progress'}\nNext: ${item.next || 'verify and report result'}`;
      }
    },
    {
      prefix: 'isd',
      cardId: 'it-support-desk-card',
      title: 'IT Support Desk',
      storeKey: 'offiqa_it_support_desk',
      copyLabel: 'Copy IT reply',
      doneLabel: 'Mark resolved',
      dueLabel: 'ticket',
      stuckLabel: 'incident',
      namePlaceholder: 'Ticket / user / system (vd: VPN access)',
      contextPlaceholder: 'Issue / blocker (vd: Waiting user confirmation)',
      nextPlaceholder: 'Next IT action',
      linkPlaceholder: 'Helpdesk / admin console / runbook / Slack link',
      checklistPlaceholder: 'IT checklist: ticket, user, system, access, incident notes, runbook, confirmation',
      statuses: [['ticket', 'Ticket'], ['due', 'Due today'], ['incident', 'Incident'], ['waiting', 'Waiting user'], ['vendor', 'Waiting vendor'], ['access', 'Access request'], ['resolved', 'Resolved']],
      priorityStatuses: ['due', 'incident', 'access'],
      stuckStatuses: ['waiting', 'incident'],
      priorityTitle: 'Tickets / incidents',
      stuckTitle: 'Waiting / incident',
      backlogTitle: 'IT queue',
      emptyText: 'No IT support items yet. Add tickets, incidents, access requests or user follow-ups.',
      openLabel: 'Open ticket',
      snippet(item) {
        return `Hi ${item.name},\n\nQuick update on ${item.context || 'your IT request'}. The next step is ${item.next || 'to confirm whether the issue is resolved'}.\n\nThanks!`;
      }
    },
    {
      prefix: 'ood',
      cardId: 'office-operations-desk-card',
      title: 'Office Operations Desk',
      storeKey: 'offiqa_office_operations_desk',
      copyLabel: 'Copy office update',
      doneLabel: 'Mark done',
      dueLabel: 'office task',
      stuckLabel: 'vendor',
      namePlaceholder: 'Office request / vendor / facility (vd: Badge printer)',
      contextPlaceholder: 'Issue / blocker (vd: Waiting building manager)',
      nextPlaceholder: 'Next office action',
      linkPlaceholder: 'Vendor / ticket / building / docs / email link',
      checklistPlaceholder: 'Office checklist: vendor, facility, supplies, event, employee request, building follow-up',
      statuses: [['request', 'Office request'], ['due', 'Due today'], ['vendor', 'Waiting vendor'], ['facility', 'Facility issue'], ['event', 'Office event'], ['done', 'Done']],
      priorityStatuses: ['due', 'facility', 'event'],
      stuckStatuses: ['vendor'],
      priorityTitle: 'Today / facility',
      stuckTitle: 'Waiting vendor',
      backlogTitle: 'Office queue',
      emptyText: 'No office operations items yet. Add office requests, vendor follow-ups, facility issues or events.',
      openLabel: 'Open office link',
      snippet(item) {
        return `Office ops update: ${item.name}\nContext: ${item.context || 'in progress'}\nNext: ${item.next || 'confirm and close the loop'}`;
      }
    },
    {
      prefix: 'tod',
      cardId: 'teaching-operations-desk-card',
      title: 'Teaching Operations Desk',
      storeKey: 'offiqa_teaching_operations_desk',
      copyLabel: 'Copy teaching note',
      doneLabel: 'Mark done',
      dueLabel: 'class item',
      stuckLabel: 'follow-up',
      namePlaceholder: 'Class / lesson / student follow-up (vd: Algebra lesson)',
      contextPlaceholder: 'Type / blocker (vd: Parent update - missing work)',
      nextPlaceholder: 'Next teaching action',
      linkPlaceholder: 'LMS / SIS / gradebook / Drive / email link',
      checklistPlaceholder: 'Teaching checklist: lesson, grading, parent/student follow-up, meeting prep, sub plan, LMS link',
      statuses: [['due', 'Due today'], ['lesson', 'Lesson prep'], ['worksheet', 'Needs worksheet'], ['grading', 'Grading in progress'], ['feedback', 'Feedback pending'], ['posted', 'Grades posted'], ['followup', 'Parent/student follow-up'], ['meeting', 'Meeting prep'], ['subplan', 'Sub plan'], ['logged', 'Logged']],
      priorityStatuses: ['due', 'lesson', 'worksheet', 'grading'],
      stuckStatuses: ['feedback', 'followup'],
      priorityTitle: 'Today / lesson',
      stuckTitle: 'Follow-up queue',
      backlogTitle: 'Teaching queue',
      emptyText: 'No teaching operations items yet. Add lesson prep, grading, parent/student follow-ups or meeting prep.',
      openLabel: 'Open class',
      snippet(item) {
        return `Quick update: ${item.name} currently needs ${item.context || 'attention'}. The next step is ${item.next || 'to complete the pending class action'}.`;
      }
    },
    {
      prefix: 'ssd',
      cardId: 'student-study-desk-card',
      title: 'Student Study Desk',
      storeKey: 'offiqa_student_study_desk',
      copyLabel: 'Copy study note',
      doneLabel: 'Mark submitted',
      dueLabel: 'study item',
      stuckLabel: 'at risk',
      namePlaceholder: 'Assignment / exam / reading (vd: History essay)',
      contextPlaceholder: 'Course / risk (vd: English 102 - not started)',
      nextPlaceholder: 'Small next study action',
      linkPlaceholder: 'LMS / Doc / notes / flashcards / course link',
      checklistPlaceholder: 'Study checklist: assignment steps, exam topics, reading, notes review, LMS/doc/flashcards',
      statuses: [['due', 'Assignment due'], ['exam', 'Exam prep'], ['reading', 'Reading'], ['notes', 'Notes review'], ['group', 'Group project'], ['submitted', 'Submitted'], ['course', 'Course workspace']],
      priorityStatuses: ['due', 'exam', 'notes'],
      stuckStatuses: ['group'],
      priorityTitle: 'Due / exams',
      stuckTitle: 'Stuck / group',
      backlogTitle: 'Study queue',
      emptyText: 'No study items yet. Add assignments, exams, readings, notes review or course workspace links.',
      openLabel: 'Open course',
      snippet(item) {
        return `Study plan: ${item.name}\nCourse/context: ${item.context || 'course item'}\nNext small action: ${item.next || 'start a focused study session'}`;
      }
    }
  ];

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function addDays(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function daysBetween(date) {
    if (!date) return 0;
    const start = new Date(`${date}T00:00:00`);
    const now = new Date(`${todayStr()}T00:00:00`);
    return Math.round((now - start) / 86400000);
  }

  function daysUntil(date) {
    return date ? -daysBetween(date) : 9999;
  }

  function isSales(config) {
    return config.mode === 'sales';
  }

  function isMarketing(config) {
    return config.mode === 'marketing';
  }

  function isAccounting(config) {
    return config.mode === 'accounting';
  }

  function isHR(config) {
    return config.mode === 'hr';
  }

  function isPurchasing(config) {
    return config.mode === 'purchasing';
  }

  function isDeveloper(config) {
    return config.mode === 'developer';
  }

  function isDesign(config) {
    return config.mode === 'design';
  }

  function isToday(date) {
    return Boolean(date) && date === todayStr();
  }

  function isPast(date) {
    return Boolean(date) && date < todayStr();
  }

  function numericValue(value) {
    const parsed = Number(String(value || '').replace(/[^\d.]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function getWorkspaceLinks(item) {
    return [
      ['link', 'Workspace', item.link],
      ['crmUrl', 'CRM', item.crmUrl],
      ['gmailUrl', 'Gmail', item.gmailUrl],
      ['linkedinUrl', 'LinkedIn', item.linkedinUrl],
      ['proposalUrl', 'Proposal', item.proposalUrl],
      ['meetingUrl', 'Meeting', item.meetingUrl]
    ].filter(([, , url]) => url);
  }

  function getMarketingWorkspaceLinks(item) {
    return [
      ['link', 'Workspace', item.link],
      ['briefUrl', 'Brief', item.briefUrl],
      ['calendarUrl', 'Calendar', item.calendarUrl],
      ['driveUrl', 'Drive', item.driveUrl],
      ['designUrl', 'Canva/Figma', item.designUrl],
      ['adsUrl', 'Ads', item.adsUrl],
      ['analyticsUrl', 'Analytics', item.analyticsUrl],
      ['landingUrl', 'Landing', item.landingUrl],
      ['slackUrl', 'Slack', item.slackUrl],
      ['researchUrl', 'Research', item.researchUrl],
      ['sourceUrl', 'Source', item.sourceUrl]
    ].filter(([, , url]) => url);
  }

  function getDesignWorkspaceLinks(item) {
    return [
      ['link', 'Workspace', item.link],
      ['figmaUrl', 'Figma', item.figmaUrl],
      ['canvaUrl', 'Canva', item.canvaUrl],
      ['adobeUrl', 'Adobe/Build', item.adobeUrl],
      ['briefUrl', 'Brief', item.briefUrl],
      ['brandUrl', 'Brand', item.brandUrl],
      ['assetUrl', 'Assets', item.assetUrl],
      ['moodboardUrl', 'Moodboard', item.moodboardUrl],
      ['feedbackUrl', 'Feedback', item.feedbackUrl],
      ['handoffUrl', 'Handoff', item.handoffUrl],
      ['clientThreadUrl', 'Client thread', item.clientThreadUrl]
    ].filter(([, , url]) => url);
  }

  function getHRWorkspaceLinks(item) {
    return [
      ['link', 'Workspace', item.link],
      ['hrisUrl', 'HRIS', item.hrisUrl],
      ['driveUrl', 'Drive', item.driveUrl],
      ['payrollUrl', 'Payroll', item.payrollUrl],
      ['emailUrl', 'Email', item.emailUrl],
      ['itTicketUrl', 'IT ticket', item.itTicketUrl],
      ['benefitsUrl', 'Benefits', item.benefitsUrl],
      ['offerUrl', 'Offer', item.offerUrl],
      ['checklistUrl', 'Checklist', item.checklistUrl]
    ].filter(([, , url]) => url);
  }

  function marketingWaitingDays(item) {
    return item.waitingSince ? daysBetween(item.waitingSince) : 0;
  }

  function isMarketingApprovalBlocked(item) {
    return ['approval', 'changes', 'design'].includes(item.status);
  }

  function hasNoMarketingNextStep(item) {
    return !['published', 'done'].includes(item.status) && !item.next;
  }

  function isLaunchSoon(item) {
    if (!item.date || !['drafting', 'design', 'approval', 'changes', 'scheduled'].includes(item.status)) return false;
    return daysBetween(item.date) >= -1 && daysBetween(item.date) <= 0;
  }

  function isMetricOverdue(item) {
    return Boolean(item.metricDue) && item.metricDue <= todayStr() && ['published', 'measure'].includes(item.status);
  }

  function marketingPriorityScore(item) {
    let score = 0;
    if (isPast(item.date)) score += 100;
    else if (isToday(item.date)) score += 90;
    else if (isLaunchSoon(item)) score += 80;
    if (isMarketingApprovalBlocked(item)) score += 70 + Math.min(marketingWaitingDays(item) * 5, 30);
    if (hasNoMarketingNextStep(item)) score += 45;
    if (isMetricOverdue(item)) score += 55;
    if (item.status === 'idea') score += Math.max(10, 35 - Math.floor(daysBetween(item.createdAtDate || '') / 2 || 0));
    return score;
  }

  function designWaitingDays(item) {
    if (!['feedback', 'approval'].includes(item.status)) return 0;
    return item.waitingSince ? daysBetween(item.waitingSince) : 0;
  }

  function designRevisionCurrent(item) {
    const value = Number.parseInt(item.currentRevision, 10);
    return Number.isFinite(value) ? Math.max(value, 0) : 0;
  }

  function designRevisionLimit(item) {
    const value = Number.parseInt(item.revisionLimit, 10);
    return Number.isFinite(value) ? Math.max(value, 0) : 0;
  }

  function isDesignRevisionLimitReached(item) {
    const limit = designRevisionLimit(item);
    return limit > 0 && designRevisionCurrent(item) >= limit;
  }

  function hasNoDesignNextStep(item) {
    return !['approved', 'done'].includes(item.status) && !item.next;
  }

  function designChecklistItems(item, config) {
    return splitChecklist(item.checklist || (config.defaultChecklist || []).join('\n'));
  }

  function isDesignHandoffIncomplete(item, config) {
    if (item.status !== 'handoff') return false;
    const checklist = designChecklistItems(item, config);
    const done = Array.isArray(item.checklistDone) ? item.checklistDone : [];
    return checklist.length > 0 && done.length < checklist.length;
  }

  function designPriorityScore(item, config) {
    let score = 0;
    if (isPast(item.date)) score += 120;
    else if (isToday(item.date)) score += 100;
    if (item.status === 'due') score += 100;
    if (item.status === 'changes') score += 80;
    if (item.status === 'handoff') score += isDesignHandoffIncomplete(item, config) ? 85 : 70;
    if (['feedback', 'approval'].includes(item.status)) score += 65 + Math.min(designWaitingDays(item) * 8, 40);
    if (isDesignRevisionLimitReached(item)) score += 90;
    if (hasNoDesignNextStep(item)) score += 45;
    if (item.status === 'internal') score += 35;
    return score;
  }

  function salesLastTouchDays(item) {
    return item.lastTouch ? daysBetween(item.lastTouch) : 0;
  }

  function isQuietSalesLead(item) {
    if (['closed', 'done', 'won', 'lost'].includes(item.status)) return false;
    return salesLastTouchDays(item) >= 5;
  }

  function isProposalStale(item) {
    return item.status === 'proposal' && salesLastTouchDays(item) >= 3;
  }

  function hasNoSalesNextStep(item) {
    return ['contacted', 'discovery', 'proposal', 'negotiation'].includes(item.status) && !item.next;
  }

  function salesPriorityScore(item) {
    let score = 0;
    if (isPast(item.date)) score += 120;
    else if (isToday(item.date)) score += 100;
    if (item.status === 'meeting' && isToday(item.date)) score += 80;
    if (isProposalStale(item)) score += 65;
    if (item.status === 'new' && !item.lastTouch) score += 45;
    if (hasNoSalesNextStep(item)) score += 40;
    if (isQuietSalesLead(item)) score += 30;
    score += Math.min(Math.floor(numericValue(item.value) / 1000), 25);
    return score;
  }

  function getAccountingWorkspaceLinks(item) {
    return [
      ['link', 'Workspace', item.link],
      ['qboUrl', 'QBO', item.qboUrl],
      ['xeroUrl', 'Xero', item.xeroUrl],
      ['driveUrl', 'Drive', item.driveUrl],
      ['portalUrl', 'Portal', item.portalUrl],
      ['emailUrl', 'Email', item.emailUrl],
      ['taxUrl', 'Tax', item.taxUrl]
    ].filter(([, , url]) => url);
  }

  function accountingDefaultChecklist(workType) {
    if (['monthly_close', 'bookkeeping', 'reporting'].includes(workType)) {
      return ['Bank feed reviewed', 'Bank reconciliation', 'Credit card reconciliation', 'Receipts matched', 'Uncategorized cleared', 'Payroll posted', 'AR/AP reviewed', 'Reports generated'];
    }
    if (workType === 'tax_return') {
      return ['Bank statements', 'Credit card statements', 'Receipts', 'Invoices', 'Payroll reports', '1099/W-2/tax docs', 'Loan/mortgage interest', 'Donation receipts'];
    }
    return [];
  }

  function accountingOpenQuestions(item) {
    return numericValue(item.questionCount) + numericValue(item.receiptCount);
  }

  function accountingMissingCount(item) {
    const checklistItems = splitChecklist(item.checklist);
    const done = Array.isArray(item.checklistDone) ? item.checklistDone : [];
    return checklistItems.filter((_, index) => !done.includes(index)).length;
  }

  function accountingWaitingDays(item) {
    return item.waitingSince ? daysBetween(item.waitingSince) : 0;
  }

  function hasAccountingBlockers(item) {
    return ['waiting', 'info', 'collecting'].includes(item.status) || accountingMissingCount(item) > 0 || accountingOpenQuestions(item) > 0;
  }

  function isAccountingAtRisk(item) {
    const until = daysUntil(item.date);
    return until <= 3 && hasAccountingBlockers(item) && !['filed', 'done'].includes(item.status);
  }

  function hasNoAccountingNextStep(item) {
    return !['filed', 'done'].includes(item.status) && !item.next;
  }

  function accountingPriorityScore(item) {
    let score = 0;
    const until = daysUntil(item.date);
    if (isPast(item.date)) score += 160;
    else if (isToday(item.date)) score += 135;
    else if (until > 0 && until <= 3) score += hasAccountingBlockers(item) ? 125 : 75;
    if (isAccountingAtRisk(item)) score += 55;
    if (['review', 'ready'].includes(item.status)) score += 90;
    if (item.status === 'due') score += 80;
    if (['waiting', 'info'].includes(item.status)) score += 50 + Math.min(accountingWaitingDays(item) * 5, 45);
    score += Math.min(accountingOpenQuestions(item) * 8, 40);
    if (hasNoAccountingNextStep(item)) score += 30;
    return score;
  }

  function hrDefaultChecklist(workflowType) {
    if (workflowType === 'offboarding') {
      return ['Final paycheck / payroll notified', 'Benefits notice', 'Equipment return', 'Access removal', 'Email forwarding / account disable', 'Expense reports', 'Exit interview', 'Manager notified', 'Files archived'];
    }
    if (workflowType === 'benefits') {
      return ['Enrollment not started', 'Reminder sent', 'Dependent docs checked', 'Decline/enroll confirmed', 'Deadline reviewed', 'Completed'];
    }
    if (workflowType === 'leave') {
      return ['Leave dates confirmed', 'Docs requested', 'Coverage/manager notified', 'Return date noted', 'Return-to-work reminder'];
    }
    if (workflowType === 'request') {
      return ['Request acknowledged', 'Details/docs requested', 'Owner/system checked', 'Follow-up date set', 'Closed'];
    }
    return ['Paperwork', 'IT setup', 'Manager task', 'Payroll', 'Benefits', 'Access/equipment'];
  }

  function normalizeHRStatus(status) {
    const value = status || 'due';
    const legacy = {
      waiting: 'waiting_employee',
      new_hire: 'paperwork',
      request: 'request_new',
      leave: 'leave_pending',
      benefits: 'benefits_progress',
      offboarding: 'offboarding_open',
      ready: 'ready_day1',
      done: 'completed'
    };
    return legacy[value] || value;
  }

  function hrChecklistItems(item) {
    return splitChecklist(item.checklist || hrDefaultChecklist(item.workflowType || 'onboarding').join('\n'));
  }

  function hrMissingCount(item) {
    const checklistItems = hrChecklistItems(item);
    const done = Array.isArray(item.checklistDone) ? item.checklistDone : [];
    return checklistItems.filter((_, index) => !done.includes(index)).length;
  }

  function hrWaitingDays(item) {
    return item.waitingSince ? daysBetween(item.waitingSince) : 0;
  }

  function hrDueDates(item) {
    return [item.date, item.startDate, item.lastDay, item.benefitDeadline, item.returnDate, item.leaveEnd]
      .filter(Boolean)
      .sort();
  }

  function hrNearestDate(item) {
    return hrDueDates(item)[0] || '';
  }

  function hrNearestDaysUntil(item) {
    const date = hrNearestDate(item);
    return date ? daysUntil(date) : 9999;
  }

  function hrIsWaiting(item) {
    return ['waiting_employee', 'waiting_manager', 'waiting_it', 'waiting_vendor', 'leave_pending', 'benefits_docs', 'offboarding_waiting'].includes(item.status)
      || (item.waitingOn && item.waitingOn !== 'none' && hrWaitingDays(item) > 0);
  }

  function hrWorkflowType(item) {
    if (item.workflowType) return item.workflowType;
    if (['offboarding_notice', 'offboarding_open', 'offboarding_waiting', 'access_equipment', 'final_items', 'offboarding'].includes(item.status)) return 'offboarding';
    if (['benefits_not_started', 'benefits_progress', 'benefits_docs', 'reminder_sent', 'benefits_complete', 'benefits'].includes(item.status)) return 'benefits';
    if (['leave_pending', 'leave_approved', 'returning_soon', 'leave'].includes(item.status)) return 'leave';
    if (['request_new', 'request_progress', 'waiting_vendor', 'request'].includes(item.status)) return 'request';
    return 'onboarding';
  }

  function hasNoHRNextStep(item) {
    return !['done', 'completed', 'benefits_complete'].includes(item.status) && !item.next;
  }

  function isHRChecklistRisk(item) {
    const workflow = hrWorkflowType(item);
    const until = hrNearestDaysUntil(item);
    const missing = hrMissingCount(item);
    if (workflow === 'onboarding') return until <= 3 && missing > 0;
    if (workflow === 'offboarding') return until <= 7 && missing > 0;
    if (workflow === 'benefits') return until <= 5 && !['benefits_complete', 'completed', 'done'].includes(item.status);
    if (workflow === 'leave') return until <= 3 && ['leave_pending', 'returning_soon'].includes(item.status);
    return false;
  }

  function hrPriorityScore(item) {
    let score = 0;
    const until = hrNearestDaysUntil(item);
    if (isPast(hrNearestDate(item))) score += 180;
    else if (isToday(hrNearestDate(item))) score += 150;
    else if (until > 0 && until <= 3) score += 120;
    else if (until > 3 && until <= 7) score += 70;
    if (item.status === 'due') score += 130;
    if (isHRChecklistRisk(item)) score += 80;
    if (hrWorkflowType(item) === 'offboarding' && ['offboarding_open', 'offboarding_waiting', 'access_equipment', 'final_items', 'offboarding'].includes(item.status)) score += 85;
    if (hrWorkflowType(item) === 'benefits' && ['benefits_not_started', 'benefits_progress', 'benefits_docs', 'reminder_sent', 'benefits'].includes(item.status)) score += 70;
    if (hrWorkflowType(item) === 'leave' && ['leave_pending', 'returning_soon', 'leave'].includes(item.status)) score += 65;
    if (hrIsWaiting(item)) score += 55 + Math.min(hrWaitingDays(item) * 6, 45);
    score += Math.min(hrMissingCount(item) * 8, 48);
    if (hasNoHRNextStep(item)) score += 35;
    return score;
  }

  function getPurchasingWorkspaceLinks(item) {
    return [
      ['link', 'Workspace', item.link],
      ['erpUrl', 'ERP', item.erpUrl],
      ['emailUrl', 'Email', item.emailUrl],
      ['portalUrl', 'Portal', item.portalUrl],
      ['quoteFolderUrl', 'Quotes', item.quoteFolderUrl],
      ['contractUrl', 'Contract', item.contractUrl],
      ['invoiceUrl', 'Invoice/AP', item.invoiceUrl]
    ].filter(([, , url]) => url);
  }

  function purchasingDefaultChecklist(type) {
    if (type === 'quote') return ['Vendor A response', 'Vendor B response', 'Vendor C response', 'Freight confirmed', 'Lead time confirmed', 'MOQ checked', 'Payment terms checked', 'Ready for review'];
    if (type === 'delivery') return ['Ordered qty checked', 'Delivery ETA checked', 'Receiving confirmed', 'Partial delivery noted', 'Supplier update requested', 'Warehouse/AP updated'];
    if (type === 'invoice') return ['PO price checked', 'Invoice price checked', 'Receipt checked', 'Freight checked', 'AP/vendor contacted', 'Mismatch resolved'];
    if (type === 'contract') return ['Renewal date checked', 'Notice window checked', 'Pricing review due', 'Supplier issue noted', 'Legal/risk review checked'];
    return ['Request info complete', 'Quote received', 'Approval clear', 'PO sent', 'Supplier acknowledged', 'ETA confirmed', 'Receiving checked', 'Invoice matched'];
  }

  function purchasingChecklistMissing(item) {
    const checklistItems = splitChecklist(item.checklist);
    const done = Array.isArray(item.checklistDone) ? item.checklistDone : [];
    return checklistItems.filter((_, index) => !done.includes(index)).length;
  }

  function purchasingWaitingDays(item) {
    return item.waitingSince ? daysBetween(item.waitingSince) : 0;
  }

  function purchasingSentDays(item) {
    return item.sentDate ? daysBetween(item.sentDate) : 0;
  }

  function purchasingMissingQuotes(item) {
    const requested = numericValue(item.quoteRequested);
    const received = numericValue(item.quoteReceived);
    return Math.max(requested - received, 0);
  }

  function hasNoPurchasingNextStep(item) {
    return !['closed', 'done'].includes(item.status) && !item.next;
  }

  function isPurchasingNoAck(item) {
    return ['po_sent', 'vendor', 'po'].includes(item.status) && item.ackStatus !== 'ack' && purchasingSentDays(item) >= 2;
  }

  function isPurchasingApprovalStuck(item) {
    return item.status === 'approval' && purchasingWaitingDays(item) >= 2;
  }

  function isPurchasingQuoteMissing(item) {
    return ['sourcing', 'quote_requested', 'quote_clarify'].includes(item.status) && (purchasingMissingQuotes(item) > 0 || Boolean(item.quoteMissing));
  }

  function isPurchasingEtaRisk(item) {
    return Boolean(item.etaDate) && item.etaDate <= todayStr() && !['delivered', 'ready_close', 'closed'].includes(item.status);
  }

  function isPurchasingInvoiceMismatch(item) {
    return item.status === 'invoice' || Boolean(item.issueType);
  }

  function isPurchasingRenewalRisk(item) {
    const windowDays = numericValue(item.renewalWindow) || 60;
    return Boolean(item.renewalDate) && daysUntil(item.renewalDate) <= windowDays && !['closed', 'done'].includes(item.status);
  }

  function hasPurchasingBlockers(item) {
    return ['missing', 'approval', 'vendor', 'quote_requested', 'quote_clarify', 'receipt', 'invoice', 'risk'].includes(item.status)
      || isPurchasingNoAck(item)
      || isPurchasingQuoteMissing(item)
      || isPurchasingInvoiceMismatch(item)
      || purchasingChecklistMissing(item) > 0;
  }

  function isPurchasingAtRisk(item) {
    const until = daysUntil(item.date);
    return (until <= 3 && hasPurchasingBlockers(item))
      || isPurchasingNoAck(item)
      || isPurchasingApprovalStuck(item)
      || isPurchasingEtaRisk(item)
      || isPurchasingInvoiceMismatch(item)
      || isPurchasingRenewalRisk(item);
  }

  function purchasingPriorityScore(item) {
    let score = 0;
    const until = daysUntil(item.date);
    if (isPast(item.date)) score += 170;
    else if (isToday(item.date)) score += 140;
    else if (until > 0 && until <= 3) score += hasPurchasingBlockers(item) ? 125 : 70;
    if (isPurchasingEtaRisk(item)) score += 120;
    if (isPurchasingNoAck(item)) score += 105 + Math.min(purchasingSentDays(item) * 5, 35);
    if (isPurchasingApprovalStuck(item)) score += 95 + Math.min(purchasingWaitingDays(item) * 5, 35);
    if (isPurchasingInvoiceMismatch(item)) score += 100;
    if (isPurchasingQuoteMissing(item)) score += 75 + Math.min(purchasingMissingQuotes(item) * 12, 36);
    if (isPurchasingRenewalRisk(item)) score += daysUntil(item.renewalDate) <= 30 ? 90 : 60;
    if (['risk', 'delivery', 'partial', 'receipt', 'ready_close'].includes(item.status)) score += 55;
    if (hasNoPurchasingNextStep(item)) score += 35;
    return score;
  }

  function getDeveloperWorkspaceLinks(item) {
    return [
      ['link', 'Workspace', item.link],
      ['githubUrl', 'Repo', item.githubUrl],
      ['ticketUrl', 'Ticket', item.ticketUrl],
      ['prUrl', 'PR', item.prUrl],
      ['ciUrl', 'CI', item.ciUrl],
      ['logsUrl', 'Logs', item.logsUrl],
      ['stagingUrl', 'Staging/Admin', item.stagingUrl],
      ['docsUrl', 'Docs', item.docsUrl],
      ['designUrl', 'Design', item.designUrl]
    ].filter(([, , url]) => url);
  }

  function developerDefaultChecklist(type) {
    if (type === 'ci') return ['Open failing run', 'Identify failed job', 'Rerun once', 'Reproduce locally', 'Check logs/artifacts', 'Fix or ask infra help'];
    if (type === 'release') return ['PR merged', 'CI green', 'Migration checked', 'Env variables checked', 'Feature flag checked', 'Rollback note ready', 'Smoke test done', 'Monitoring/logs checked'];
    if (type === 'incident') return ['Reproduce issue', 'Check logs', 'Check recent deploy', 'Assess user/data risk', 'Patch or rollback', 'Smoke test', 'Post-fix note'];
    if (type === 'env') return ['Check env vars', 'Check tokens/access', 'Rebuild dependencies', 'Run migration/seed', 'Check Docker/simulator', 'Record workaround'];
    if (type === 'pr') return ['PR link added', 'Reviewer assigned', 'CI green', 'Changes addressed', 'Ready merge confirmed'];
    return ['Branch noted', 'Next file/test noted', 'Acceptance criteria checked', 'Local tests run', 'PR opened', 'Docs/runbook checked'];
  }

  function developerChecklistMissing(item) {
    const checklistItems = splitChecklist(item.checklist);
    const done = Array.isArray(item.checklistDone) ? item.checklistDone : [];
    return checklistItems.filter((_, index) => !done.includes(index)).length;
  }

  function developerWaitingDays(item) {
    return item.waitingSince ? daysBetween(item.waitingSince) : 0;
  }

  function developerLastActivityDays(item) {
    return item.lastActivity ? daysBetween(item.lastActivity) : 0;
  }

  function hasNoDeveloperNextStep(item) {
    return !['done', 'shipped'].includes(item.status) && !item.next;
  }

  function normalizeDeveloperStatus(status) {
    const map = {
      todo: 'ready',
      due: 'coding',
      review: 'pr_open',
      qa: 'release',
      shipped: 'done'
    };
    return map[status] || status;
  }

  function isDeveloperIncident(item) {
    return item.status === 'incident' || ['prod', 'user_blocked', 'data'].includes(item.risk);
  }

  function isDeveloperCiFailed(item) {
    return item.status === 'ci_failed' || Boolean(item.ciType);
  }

  function isDeveloperPrWaiting(item) {
    return ['pr_open', 'review'].includes(item.status) || ['waiting', 'changes', 'stale', 'need_review'].includes(item.prStatus);
  }

  function isDeveloperPrStale(item) {
    return isDeveloperPrWaiting(item) && developerWaitingDays(item) >= 2;
  }

  function isDeveloperBlocked(item) {
    return ['blocked', 'clarify', 'env_issue'].includes(item.status) || Boolean(item.blockerType) || developerWaitingDays(item) >= 3;
  }

  function isDeveloperReleaseRisk(item) {
    return item.status === 'release' || item.risk === 'release' || (item.devType === 'release' && developerChecklistMissing(item) > 0);
  }

  function isDeveloperDocsPending(item) {
    return item.status === 'docs' || (item.devType === 'docs' && developerChecklistMissing(item) > 0);
  }

  function developerPriorityScore(item) {
    let score = 0;
    const until = daysUntil(item.date);
    if (isPast(item.date)) score += 145;
    else if (isToday(item.date)) score += 120;
    else if (until > 0 && until <= 2) score += 80;
    if (isDeveloperIncident(item)) score += 180;
    if (isDeveloperCiFailed(item)) score += 135;
    if (isDeveloperReleaseRisk(item)) score += 115;
    if (isDeveloperPrStale(item)) score += 95 + Math.min(developerWaitingDays(item) * 6, 36);
    else if (isDeveloperPrWaiting(item)) score += 75;
    if (isDeveloperBlocked(item)) score += 80 + Math.min(developerWaitingDays(item) * 5, 35);
    if (hasNoDeveloperNextStep(item)) score += 45;
    if (item.status === 'coding') score += Math.max(10, 45 - Math.min(developerLastActivityDays(item) * 6, 35));
    if (isDeveloperDocsPending(item)) score += 25;
    return score;
  }

  function flash(msg) {
    const node = document.createElement('div');
    node.textContent = msg;
    Object.assign(node.style, {
      position: 'fixed',
      bottom: '24px',
      left: '50%',
      transform: 'translateX(-50%)',
      background: '#111827',
      color: 'white',
      padding: '8px 14px',
      borderRadius: '8px',
      fontSize: '13px',
      zIndex: 9999,
      opacity: '0',
      transition: 'opacity .2s'
    });
    document.body.appendChild(node);
    requestAnimationFrame(() => { node.style.opacity = '1'; });
    setTimeout(() => {
      node.style.opacity = '0';
      setTimeout(() => node.remove(), 250);
    }, 1600);
  }

  function initDesk(config) {
    const p = config.prefix;
    const card = document.getElementById(config.cardId);
    if (!card || card.dataset.professionalDeskReady === 'true') return;
    card.dataset.professionalDeskReady = 'true';
    if (config.forceShell || !document.getElementById(`${p}-form`)) {
      renderDeskShell(card, config);
    }

    const els = {
      addBtn: document.getElementById(`${p}-add-btn`),
      form: document.getElementById(`${p}-form`),
      name: document.getElementById(`${p}-name-input`),
      context: document.getElementById(`${p}-context-input`),
      next: document.getElementById(`${p}-next-input`),
      link: document.getElementById(`${p}-link-input`),
      checklist: document.getElementById(`${p}-checklist-input`),
      date: document.getElementById(`${p}-date-input`),
      status: document.getElementById(`${p}-status-input`),
      save: document.getElementById(`${p}-save-btn`),
      cancel: document.getElementById(`${p}-cancel-btn`),
      empty: document.getElementById(`${p}-empty`),
      body: document.getElementById(`${p}-body`),
      dueCount: document.getElementById(`${p}-due-count`),
      stuckCount: document.getElementById(`${p}-stuck-count`),
      prioritySection: document.getElementById(`${p}-priority-section`),
      priorityCount: document.getElementById(`${p}-priority-count`),
      priorityList: document.getElementById(`${p}-priority-list`),
      stuckSection: document.getElementById(`${p}-stuck-section`),
      stuckSectionCount: document.getElementById(`${p}-stuck-section-count`),
      stuckList: document.getElementById(`${p}-stuck-list`),
      backlogSection: document.getElementById(`${p}-backlog-section`),
      backlogCount: document.getElementById(`${p}-backlog-count`),
      backlogList: document.getElementById(`${p}-backlog-list`),
      openAll: document.getElementById(`${p}-open-all`)
    };
    const extraEls = Object.fromEntries((config.extraFields || []).map((field) => [
      field.key,
      document.getElementById(`${p}-${field.key}-input`)
    ]));

    let items = [];
    let openId = null;

    async function load() {
      const data = await OffiqaIDB.get(config.storeKey);
      return Array.isArray(data) ? data : [];
    }

    async function persist() {
      await OffiqaIDB.set(config.storeKey, items);
    }

    function isPriority(item) {
      if (isSales(config)) return salesPriorityScore(item) > 0;
      if (isMarketing(config)) return marketingPriorityScore(item) > 0;
      if (isAccounting(config)) return accountingPriorityScore(item) > 0;
      if (isPurchasing(config)) return purchasingPriorityScore(item) > 0;
      if (isDeveloper(config)) return developerPriorityScore(item) > 0;
      if (isHR(config)) return hrPriorityScore(item) > 0;
      if (isDesign(config)) return designPriorityScore(item, config) > 0;
      const priorityStatuses = config.priorityStatuses || ['due', 'meeting', 'launch'];
      return priorityStatuses.includes(item.status) || item.date <= todayStr();
    }

    function isTerminalStatus(status) {
      const terminal = config.doneStatuses || [
        'done', 'closed', 'resolved', 'shipped', 'passed', 'logged', 'submitted',
        'filed', 'sent', 'won', 'lost', 'approved', 'received', 'delivered',
        'hired', 'rejected', 'decided', 'posted'
      ];
      return terminal.includes(status);
    }

    function isStuck(item) {
      if (isSales(config)) {
        return hasNoSalesNextStep(item) || isQuietSalesLead(item) || isProposalStale(item);
      }
      if (isMarketing(config)) {
        return isMarketingApprovalBlocked(item) || hasNoMarketingNextStep(item) || isMetricOverdue(item);
      }
      if (isAccounting(config)) {
        return ['waiting', 'info'].includes(item.status) || accountingWaitingDays(item) >= 3 || hasNoAccountingNextStep(item);
      }
      if (isPurchasing(config)) {
        return ['missing', 'approval', 'vendor', 'quote_requested', 'quote_clarify', 'receipt', 'invoice'].includes(item.status)
          || purchasingWaitingDays(item) >= 3
          || isPurchasingNoAck(item)
          || hasNoPurchasingNextStep(item);
      }
      if (isDeveloper(config)) {
        return isDeveloperBlocked(item) || isDeveloperPrWaiting(item) || isDeveloperCiFailed(item) || hasNoDeveloperNextStep(item);
      }
      if (isHR(config)) {
        return hrIsWaiting(item) || isHRChecklistRisk(item) || hasNoHRNextStep(item);
      }
      if (isDesign(config)) {
        return ['feedback', 'approval'].includes(item.status)
          || isDesignRevisionLimitReached(item)
          || isDesignHandoffIncomplete(item, config)
          || hasNoDesignNextStep(item);
      }
      const stuckStatuses = config.stuckStatuses || [];
      return stuckStatuses.includes(item.status) || (!item.next && item.status !== 'idea' && !isTerminalStatus(item.status));
    }

    function statusLabel(value) {
      const found = (config.statuses || []).find(([status]) => status === value);
      return found ? found[1] : value;
    }

    function sortItems(a, b) {
      if (isSales(config)) {
        const ap = salesPriorityScore(a);
        const bp = salesPriorityScore(b);
        if (ap !== bp) return bp - ap;
      }
      if (isMarketing(config)) {
        const ap = marketingPriorityScore(a);
        const bp = marketingPriorityScore(b);
        if (ap !== bp) return bp - ap;
      }
      if (isAccounting(config)) {
        const ap = accountingPriorityScore(a);
        const bp = accountingPriorityScore(b);
        if (ap !== bp) return bp - ap;
      }
      if (isPurchasing(config)) {
        const ap = purchasingPriorityScore(a);
        const bp = purchasingPriorityScore(b);
        if (ap !== bp) return bp - ap;
      }
      if (isDeveloper(config)) {
        const ap = developerPriorityScore(a);
        const bp = developerPriorityScore(b);
        if (ap !== bp) return bp - ap;
      }
      if (isHR(config)) {
        const ap = hrPriorityScore(a);
        const bp = hrPriorityScore(b);
        if (ap !== bp) return bp - ap;
      }
      if (isDesign(config)) {
        const ap = designPriorityScore(a, config);
        const bp = designPriorityScore(b, config);
        if (ap !== bp) return bp - ap;
      }
      const ap = Number(isPriority(a)) + Number(isStuck(a));
      const bp = Number(isPriority(b)) + Number(isStuck(b));
      if (ap !== bp) return bp - ap;
      const ad = a.date || '9999-12-31';
      const bd = b.date || '9999-12-31';
      if (ad !== bd) return ad < bd ? -1 : 1;
      return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
    }

    function renderSection(section, countEl, listEl, sectionItems) {
      section.hidden = sectionItems.length === 0;
      countEl.textContent = sectionItems.length || '';
      listEl.innerHTML = sectionItems.map(itemHtml).join('');
    }

    function render() {
      const active = items.filter((item) => !isTerminalStatus(item.status)).sort(sortItems);
      const priorityAll = active.filter(isPriority);
      const priority = (isMarketing(config) || isDesign(config) || isHR(config)) ? priorityAll.slice(0, 3) : priorityAll;
      const stuckAll = active.filter(isStuck);
      const stuck = stuckAll.filter((item) => !priority.includes(item));
      const backlog = active.filter((item) => !priority.includes(item) && !stuck.includes(item));

      els.dueCount.textContent = priority.length;
      els.stuckCount.textContent = stuckAll.length;
      els.empty.hidden = active.length > 0;

      renderSection(els.prioritySection, els.priorityCount, els.priorityList, priority);
      renderSection(els.stuckSection, els.stuckSectionCount, els.stuckList, stuck);
      renderSection(els.backlogSection, els.backlogCount, els.backlogList, backlog);
      bindItemEvents();
    }

    function itemHtml(item) {
      if (isSales(config)) return salesItemHtml(item);
      if (isMarketing(config)) return marketingItemHtml(item);
      if (isAccounting(config)) return accountingItemHtml(item);
      if (isPurchasing(config)) return purchasingItemHtml(item);
      if (isDeveloper(config)) return developerItemHtml(item);
      if (isHR(config)) return hrItemHtml(item);
      if (isDesign(config)) return designItemHtml(item);

      const isOpen = item.id === openId;
      const waitDays = daysBetween(item.date);
      const isLate = item.date && item.date < todayStr();
      const next = item.next || '<span style="color:var(--text-muted)">No next step</span>';
      const waiting = waitDays > 0 && isStuck(item) ? `<span class="pd-chip is-warn">waiting ${waitDays}d</span>` : '';
      const due = item.date ? `<span class="pd-chip${isLate ? ' is-danger' : ''}">${esc(isLate ? 'overdue' : item.date)}</span>` : '';
      const noNext = !item.next && !isTerminalStatus(item.status) ? '<span class="pd-chip is-danger">no next step</span>' : '';
      const checklistItems = splitChecklist(item.checklist);
      const checklist = checklistItems.length ? `
        <div class="pd-checklist">
          ${checklistItems.map((entry) => `<span class="pd-check">${esc(entry)}</span>`).join('')}
        </div>
      ` : '';

      return `
        <div class="cfu-item pd-item${isOpen ? ' is-open' : ''}" data-id="${esc(item.id)}">
          <div class="cfu-item-summary pd-item-summary" data-act="toggle">
            <div class="pd-item-main">
              <span class="cfu-item-name">${esc(item.name)}</span>
              <span class="cfu-item-deal">${esc(item.context || item.next || '')}</span>
            </div>
            <div class="pd-item-meta">
              <span class="pd-chip">${esc(statusLabel(item.status))}</span>
              ${due}
              ${waiting}
              ${noNext}
            </div>
          </div>
          ${isOpen ? `
            <div class="cfu-item-detail">
              <div class="cfu-item-detail-row"><span class="cfu-item-detail-label">Next</span>${next}</div>
              ${item.context ? `<div class="cfu-item-detail-row"><span class="cfu-item-detail-label">Context</span>${esc(item.context)}</div>` : ''}
              ${checklistItems.length ? `<div class="cfu-item-detail-row"><span class="cfu-item-detail-label">Checklist</span>${checklist}</div>` : ''}
              ${item.note ? `<div class="cfu-item-detail-row"><span class="cfu-item-detail-label">Note</span>${esc(item.note)}</div>` : ''}
              <div class="cfu-item-actions">
                ${item.link ? `<button type="button" class="cfu-action-btn" data-act="open">${esc(config.openLabel)}</button>` : ''}
                <button type="button" class="cfu-action-btn" data-act="copy">${esc(config.copyLabel)}</button>
                <button type="button" class="cfu-action-btn" data-act="snooze">Snooze +1d</button>
                <button type="button" class="cfu-action-btn" data-act="note">Note</button>
                <button type="button" class="cfu-action-btn is-primary" data-act="done">${esc(config.doneLabel)}</button>
                <button type="button" class="cfu-action-btn is-danger" data-act="delete">Delete</button>
              </div>
            </div>
          ` : ''}
        </div>`;
    }

    function optionLabel(key, value) {
      const field = (config.extraFields || []).find((item) => item.key === key);
      const found = (field?.options || []).find(([optionValue]) => optionValue === value);
      return found ? found[1] : value;
    }

    function salesDetailRow(label, value) {
      if (!value) return '';
      return `<div class="cfu-item-detail-row"><span class="cfu-item-detail-label">${esc(label)}</span>${value}</div>`;
    }

    function accountingWorkspaceButtons(item) {
      const links = getAccountingWorkspaceLinks(item);
      if (!links.length) return '';
      return `
        <div class="pd-workspace-links">
          <button type="button" class="cfu-action-btn is-primary" data-act="open-workspace">Open workspace</button>
          ${links.map(([key, label]) => `<button type="button" class="cfu-action-btn" data-act="open-${esc(key)}">${esc(label)}</button>`).join('')}
        </div>
      `;
    }

    function accountingChecklistHtml(item) {
      const checklistItems = splitChecklist(item.checklist);
      if (!checklistItems.length) return '';
      const done = Array.isArray(item.checklistDone) ? item.checklistDone : [];
      return `
        <div class="pd-launch-checklist pd-accounting-checklist">
          ${checklistItems.map((entry, index) => {
            const checked = done.includes(index);
            return `<button type="button" class="pd-check${checked ? ' is-done' : ''}" data-act="check-${index}">${checked ? '[x] ' : ''}${esc(entry)}</button>`;
          }).join('')}
        </div>
      `;
    }

    function accountingItemHtml(item) {
      const isOpen = item.id === openId;
      const missingCount = accountingMissingCount(item);
      const questionCount = numericValue(item.questionCount);
      const receiptCount = numericValue(item.receiptCount);
      const openQuestions = questionCount + receiptCount;
      const waitDays = accountingWaitingDays(item);
      const until = daysUntil(item.date);
      const isLate = isPast(item.date);
      const risk = isAccountingAtRisk(item);
      const next = item.next || '<span style="color:var(--text-muted)">No next action</span>';
      const dueLabel = item.date
        ? (isLate ? 'overdue' : isToday(item.date) ? 'today' : until <= 3 ? `due ${until}d` : item.date)
        : '';
      const due = item.date ? `<span class="pd-chip${isLate || risk ? ' is-danger' : until <= 3 ? ' is-warn' : ''}">${esc(dueLabel)}</span>` : '';
      const atRisk = risk ? '<span class="pd-chip is-danger">at risk</span>' : '';
      const waiting = waitDays > 0 ? `<span class="pd-chip is-warn">waiting ${waitDays}d</span>` : '';
      const missing = missingCount > 0 ? `<span class="pd-chip is-warn">${missingCount} missing</span>` : '';
      const questions = openQuestions > 0 ? `<span class="pd-chip">${openQuestions} questions</span>` : '';
      const noNext = hasNoAccountingNextStep(item) ? '<span class="pd-chip is-danger">no next action</span>' : '';
      const period = item.period ? `<span class="pd-chip">${esc(item.period)}</span>` : '';
      const workType = optionLabel('workType', item.workType || '');
      const summary = [workType, item.period, item.context, item.next].filter(Boolean).join(' - ');
      const checklist = accountingChecklistHtml(item);
      const workspace = accountingWorkspaceButtons(item);

      return `
        <div class="cfu-item pd-item pd-accounting-item${isOpen ? ' is-open' : ''}" data-id="${esc(item.id)}">
          <div class="cfu-item-summary pd-item-summary" data-act="toggle">
            <div class="pd-item-main">
              <span class="cfu-item-name">${esc(item.name)}</span>
              <span class="cfu-item-deal">${esc(summary)}</span>
            </div>
            <div class="pd-item-meta">
              <span class="pd-chip">${esc(statusLabel(item.status))}</span>
              ${period}
              ${due}
              ${atRisk}
              ${waiting}
              ${missing}
              ${questions}
              ${noNext}
            </div>
          </div>
          ${isOpen ? `
            <div class="cfu-item-detail pd-accounting-detail">
              ${salesDetailRow('Work type', esc(workType || ''))}
              ${salesDetailRow('Period', esc(item.period || ''))}
              ${salesDetailRow('Status', esc(statusLabel(item.status)))}
              ${salesDetailRow('Due date', esc(item.date || 'Not set'))}
              ${salesDetailRow('Waiting since', item.waitingSince ? `${esc(item.waitingSince)}${waitDays > 0 ? ` (${waitDays}d)` : ''}` : '')}
              ${salesDetailRow('Last reminder', esc(item.lastReminder || ''))}
              ${salesDetailRow('Next', next)}
              ${item.context ? salesDetailRow('Client blocker', esc(item.context)) : ''}
              ${openQuestions ? salesDetailRow('Need more info', esc(`${questionCount} client question${questionCount === 1 ? '' : 's'}${receiptCount ? `, ${receiptCount} missing receipt${receiptCount === 1 ? '' : 's'}` : ''}`)) : ''}
              ${checklist ? salesDetailRow('Missing docs / close checklist', checklist) : ''}
              ${workspace ? salesDetailRow('Workspace links', workspace) : ''}
              ${item.note ? salesDetailRow('Note', esc(item.note)) : ''}
              <div class="cfu-item-actions">
                <button type="button" class="cfu-action-btn" data-act="waiting">Waiting client</button>
                <button type="button" class="cfu-action-btn" data-act="info">Need info</button>
                <button type="button" class="cfu-action-btn" data-act="last-reminder">Nudged today</button>
                <button type="button" class="cfu-action-btn" data-act="snooze">Snooze +1d</button>
                <button type="button" class="cfu-action-btn" data-act="note">Note</button>
                <button type="button" class="cfu-action-btn is-primary" data-act="review">Ready review</button>
                <button type="button" class="cfu-action-btn is-primary" data-act="ready">Ready send</button>
                <button type="button" class="cfu-action-btn is-primary" data-act="done">${esc(config.doneLabel)}</button>
                <button type="button" class="cfu-action-btn is-danger" data-act="delete">Delete</button>
              </div>
            </div>
          ` : ''}
        </div>`;
    }

    function purchasingWorkspaceButtons(item) {
      const links = getPurchasingWorkspaceLinks(item);
      if (!links.length) return '';
      return `
        <div class="pd-workspace-links">
          <button type="button" class="cfu-action-btn is-primary" data-act="open-workspace">Open workspace</button>
          ${links.map(([key, label]) => `<button type="button" class="cfu-action-btn" data-act="open-${esc(key)}">${esc(label)}</button>`).join('')}
        </div>
      `;
    }

    function purchasingChecklistHtml(item) {
      const checklistItems = splitChecklist(item.checklist);
      if (!checklistItems.length) return '';
      const done = Array.isArray(item.checklistDone) ? item.checklistDone : [];
      return `
        <div class="pd-launch-checklist pd-purchasing-checklist">
          ${checklistItems.map((entry, index) => {
            const checked = done.includes(index);
            return `<button type="button" class="pd-check${checked ? ' is-done' : ''}" data-act="check-${index}">${checked ? '[x] ' : ''}${esc(entry)}</button>`;
          }).join('')}
        </div>
      `;
    }

    function purchasingItemHtml(item) {
      const isOpen = item.id === openId;
      const waitDays = purchasingWaitingDays(item);
      const sentDays = purchasingSentDays(item);
      const missingQuotes = purchasingMissingQuotes(item);
      const checklistMissing = purchasingChecklistMissing(item);
      const until = daysUntil(item.date);
      const isLate = isPast(item.date);
      const etaLate = isPurchasingEtaRisk(item);
      const risk = isPurchasingAtRisk(item);
      const workflow = optionLabel('purchasingType', item.purchasingType || '');
      const waitOn = optionLabel('waitOn', item.waitOn || '');
      const issue = optionLabel('issueType', item.issueType || '');
      const next = item.next || '<span style="color:var(--text-muted)">No next action</span>';
      const dueLabel = item.date
        ? (isLate ? 'overdue' : isToday(item.date) ? 'today' : until <= 3 ? `due ${until}d` : item.date)
        : '';
      const due = item.date ? `<span class="pd-chip${isLate || risk ? ' is-danger' : until <= 3 ? ' is-warn' : ''}">${esc(dueLabel)}</span>` : '';
      const noAck = isPurchasingNoAck(item) ? `<span class="pd-chip is-danger">no ack ${sentDays}d</span>` : '';
      const ack = item.ackStatus === 'ack' ? '<span class="pd-chip">ack</span>' : item.ackStatus === 'not_ack' ? '<span class="pd-chip is-warn">not ack</span>' : '';
      const approval = isPurchasingApprovalStuck(item) ? `<span class="pd-chip is-warn">approval ${waitDays}d</span>` : '';
      const quote = missingQuotes > 0 ? `<span class="pd-chip is-warn">quotes ${numericValue(item.quoteReceived)}/${numericValue(item.quoteRequested)}</span>` : '';
      const eta = item.etaDate ? `<span class="pd-chip${etaLate ? ' is-danger' : daysUntil(item.etaDate) <= 3 ? ' is-warn' : ''}">ETA ${esc(etaLate ? 'late' : item.etaDate)}</span>` : '';
      const invoice = isPurchasingInvoiceMismatch(item) ? '<span class="pd-chip is-danger">invoice issue</span>' : '';
      const renewal = isPurchasingRenewalRisk(item) ? `<span class="pd-chip is-warn">renewal ${Math.max(daysUntil(item.renewalDate), 0)}d</span>` : '';
      const waiting = waitDays > 0 ? `<span class="pd-chip is-warn">waiting ${waitDays}d</span>` : '';
      const checklist = checklistMissing > 0 ? `<span class="pd-chip is-warn">${checklistMissing} open</span>` : '';
      const noNext = hasNoPurchasingNextStep(item) ? '<span class="pd-chip is-danger">no next action</span>' : '';
      const summary = [
        item.poNumber,
        item.supplier,
        workflow,
        item.context,
        item.next
      ].filter(Boolean).join(' - ');
      const checklistHtml = purchasingChecklistHtml(item);
      const workspace = purchasingWorkspaceButtons(item);

      return `
        <div class="cfu-item pd-item pd-purchasing-item${isOpen ? ' is-open' : ''}" data-id="${esc(item.id)}">
          <div class="cfu-item-summary pd-item-summary" data-act="toggle">
            <div class="pd-item-main">
              <span class="cfu-item-name">${esc(item.name)}</span>
              <span class="cfu-item-deal">${esc(summary)}</span>
            </div>
            <div class="pd-item-meta">
              <span class="pd-chip">${esc(statusLabel(item.status))}</span>
              ${due}
              ${noAck}
              ${ack}
              ${approval}
              ${quote}
              ${eta}
              ${invoice}
              ${renewal}
              ${waiting}
              ${checklist}
              ${noNext}
            </div>
          </div>
          ${isOpen ? `
            <div class="cfu-item-detail pd-purchasing-detail">
              ${salesDetailRow('Workflow', esc(workflow || ''))}
              ${salesDetailRow('PO / supplier', esc([item.poNumber, item.supplier].filter(Boolean).join(' - ')))}
              ${salesDetailRow('Requester', esc([item.requester, item.department].filter(Boolean).join(' - ')))}
              ${salesDetailRow('Status', esc(statusLabel(item.status)))}
              ${salesDetailRow('Due date', esc(item.date || 'Not set'))}
              ${salesDetailRow('Next', next)}
              ${item.context ? salesDetailRow('Blocker / issue', esc(item.context)) : ''}
              ${salesDetailRow('Approval', esc([item.approver, item.waitingSince ? `waiting since ${item.waitingSince}${waitDays > 0 ? ` (${waitDays}d)` : ''}` : ''].filter(Boolean).join(' - ')))}
              ${salesDetailRow('PO acknowledgement', esc([item.sentDate ? `sent ${item.sentDate}${sentDays > 0 ? ` (${sentDays}d)` : ''}` : '', optionLabel('ackStatus', item.ackStatus || ''), item.lastFollowup ? `last follow-up ${item.lastFollowup}` : ''].filter(Boolean).join(' - ')))}
              ${salesDetailRow('ETA / delivery', esc([item.etaDate ? `ETA ${item.etaDate}` : '', etaLate ? 'late or due' : '', item.status === 'partial' ? 'partially delivered' : ''].filter(Boolean).join(' - ')))}
              ${salesDetailRow('Quote tracker', esc([numericValue(item.quoteRequested) ? `${numericValue(item.quoteReceived)}/${numericValue(item.quoteRequested)} received` : '', item.quoteMissing].filter(Boolean).join(' - ')))}
              ${issue ? salesDetailRow('Mismatch / issue', esc(issue)) : ''}
              ${salesDetailRow('Follow-up queue', esc(waitOn || ''))}
              ${salesDetailRow('Renewal / risk', esc([item.renewalDate ? `renewal ${item.renewalDate}` : '', item.renewalWindow ? `${item.renewalWindow}d notice` : ''].filter(Boolean).join(' - ')))}
              ${checklistHtml ? salesDetailRow('Purchasing checklist', checklistHtml) : ''}
              ${workspace ? salesDetailRow('Workspace links', workspace) : ''}
              ${item.note ? salesDetailRow('Note', esc(item.note)) : ''}
              <div class="cfu-item-actions">
                <button type="button" class="cfu-action-btn" data-act="waiting-supplier">Waiting supplier</button>
                <button type="button" class="cfu-action-btn" data-act="waiting-approval">Waiting approval</button>
                <button type="button" class="cfu-action-btn" data-act="missing-info">Missing info</button>
                <button type="button" class="cfu-action-btn" data-act="purchase-approved">Mark approved</button>
                <button type="button" class="cfu-action-btn" data-act="po-sent">PO sent</button>
                <button type="button" class="cfu-action-btn" data-act="po-ack">Mark acknowledged</button>
                <button type="button" class="cfu-action-btn" data-act="quote-received">Quote received</button>
                <button type="button" class="cfu-action-btn" data-act="delivery-risk">Delivery risk</button>
                <button type="button" class="cfu-action-btn" data-act="delivered">Delivered</button>
                <button type="button" class="cfu-action-btn" data-act="invoice-issue">Invoice issue</button>
                <button type="button" class="cfu-action-btn" data-act="last-followup">Followed up today</button>
                <button type="button" class="cfu-action-btn" data-act="snooze">Snooze +1d</button>
                <button type="button" class="cfu-action-btn" data-act="note">Note</button>
                <button type="button" class="cfu-action-btn is-primary" data-act="ready-close">Ready close</button>
                <button type="button" class="cfu-action-btn is-primary" data-act="done">${esc(config.doneLabel)}</button>
                <button type="button" class="cfu-action-btn is-danger" data-act="delete">Delete</button>
              </div>
            </div>
          ` : ''}
        </div>`;
    }

    function developerWorkspaceButtons(item) {
      const links = getDeveloperWorkspaceLinks(item);
      if (!links.length) return '';
      return `
        <div class="pd-workspace-links">
          <button type="button" class="cfu-action-btn is-primary" data-act="open-workspace">Open workspace</button>
          ${links.map(([key, label]) => `<button type="button" class="cfu-action-btn" data-act="open-${esc(key)}">${esc(label)}</button>`).join('')}
        </div>
      `;
    }

    function developerChecklistHtml(item) {
      const checklistItems = splitChecklist(item.checklist);
      if (!checklistItems.length) return '';
      const done = Array.isArray(item.checklistDone) ? item.checklistDone : [];
      return `
        <div class="pd-launch-checklist pd-developer-checklist">
          ${checklistItems.map((entry, index) => {
            const checked = done.includes(index);
            return `<button type="button" class="pd-check${checked ? ' is-done' : ''}" data-act="check-${index}">${checked ? '[x] ' : ''}${esc(entry)}</button>`;
          }).join('')}
        </div>
      `;
    }

    function developerItemHtml(item) {
      const isOpen = item.id === openId;
      const waitDays = developerWaitingDays(item);
      const activityDays = developerLastActivityDays(item);
      const checklistMissing = developerChecklistMissing(item);
      const until = daysUntil(item.date);
      const isLate = isPast(item.date);
      const workflow = optionLabel('devType', item.devType || '');
      const blocker = optionLabel('blockerType', item.blockerType || '');
      const risk = optionLabel('risk', item.risk || '');
      const prStatus = optionLabel('prStatus', item.prStatus || '');
      const ciType = optionLabel('ciType', item.ciType || '');
      const environment = optionLabel('environment', item.environment || '');
      const next = item.next || '<span style="color:var(--text-muted)">No next action</span>';
      const dueLabel = item.date
        ? (isLate ? 'overdue' : isToday(item.date) ? 'today' : until <= 2 ? `due ${until}d` : item.date)
        : '';
      const due = item.date ? `<span class="pd-chip${isLate ? ' is-danger' : until <= 2 ? ' is-warn' : ''}">${esc(dueLabel)}</span>` : '';
      const incident = isDeveloperIncident(item) ? '<span class="pd-chip is-danger">prod/admin</span>' : '';
      const ci = isDeveloperCiFailed(item) ? `<span class="pd-chip is-danger">${esc(ciType || 'CI failed')}</span>` : '';
      const pr = isDeveloperPrWaiting(item) ? `<span class="pd-chip${isDeveloperPrStale(item) ? ' is-warn' : ''}">${esc(prStatus || 'PR')}</span>` : '';
      const waiting = waitDays > 0 ? `<span class="pd-chip is-warn">waiting ${waitDays}d</span>` : '';
      const blocked = isDeveloperBlocked(item) ? `<span class="pd-chip is-danger">${esc(blocker || 'blocked')}</span>` : '';
      const release = isDeveloperReleaseRisk(item) ? '<span class="pd-chip is-warn">release</span>' : '';
      const docs = isDeveloperDocsPending(item) ? '<span class="pd-chip is-warn">docs pending</span>' : '';
      const resume = item.resumeNote ? '<span class="pd-chip">resume note</span>' : '';
      const checklist = checklistMissing > 0 ? `<span class="pd-chip is-warn">${checklistMissing} checklist</span>` : '';
      const noNext = hasNoDeveloperNextStep(item) ? '<span class="pd-chip is-danger">no next action</span>' : '';
      const summary = [
        item.repo,
        item.branch,
        workflow,
        item.context,
        item.resumeNote
      ].filter(Boolean).join(' - ');
      const checklistHtml = developerChecklistHtml(item);
      const workspace = developerWorkspaceButtons(item);

      return `
        <div class="cfu-item pd-item pd-developer-item${isOpen ? ' is-open' : ''}" data-id="${esc(item.id)}">
          <div class="cfu-item-summary pd-item-summary" data-act="toggle">
            <div class="pd-item-main">
              <span class="cfu-item-name">${esc(item.name)}</span>
              <span class="cfu-item-deal">${esc(summary)}</span>
            </div>
            <div class="pd-item-meta">
              <span class="pd-chip">${esc(statusLabel(item.status))}</span>
              ${due}
              ${incident}
              ${ci}
              ${pr}
              ${waiting}
              ${blocked}
              ${release}
              ${docs}
              ${resume}
              ${checklist}
              ${noNext}
            </div>
          </div>
          ${isOpen ? `
            <div class="cfu-item-detail pd-developer-detail">
              ${salesDetailRow('Repo / branch', esc([item.repo, item.branch].filter(Boolean).join(' - ')))}
              ${salesDetailRow('Workflow', esc(workflow || ''))}
              ${salesDetailRow('Status', esc(statusLabel(item.status)))}
              ${salesDetailRow('Due date', esc(item.date || 'Not set'))}
              ${salesDetailRow('Next', next)}
              ${item.resumeNote ? salesDetailRow('Resume note', esc(item.resumeNote)) : ''}
              ${item.context ? salesDetailRow('Context / blocker', esc(item.context)) : ''}
              ${salesDetailRow('Blocker', esc([blocker, item.waitingSince ? `waiting since ${item.waitingSince}${waitDays > 0 ? ` (${waitDays}d)` : ''}` : ''].filter(Boolean).join(' - ')))}
              ${salesDetailRow('PR review', esc([prStatus, item.reviewer ? `reviewer ${item.reviewer}` : ''].filter(Boolean).join(' - ')))}
              ${salesDetailRow('CI / build', esc([ciType, item.ciLastRun ? `last run ${item.ciLastRun}` : '', item.suspectedCause].filter(Boolean).join(' - ')))}
              ${salesDetailRow('Risk / env', esc([risk, item.module, environment].filter(Boolean).join(' - ')))}
              ${item.lastActivity ? salesDetailRow('Last activity', `${esc(item.lastActivity)}${activityDays > 0 ? ` (${activityDays}d)` : ''}`) : ''}
              ${checklistHtml ? salesDetailRow('Release / debug checklist', checklistHtml) : ''}
              ${workspace ? salesDetailRow('Workspace links', workspace) : ''}
              ${item.note ? salesDetailRow('Note', esc(item.note)) : ''}
              <div class="cfu-item-actions">
                <button type="button" class="cfu-action-btn" data-act="resume-coding">Resume coding</button>
                <button type="button" class="cfu-action-btn" data-act="pr-waiting">PR waiting</button>
                <button type="button" class="cfu-action-btn" data-act="changes-requested-dev">Changes requested</button>
                <button type="button" class="cfu-action-btn" data-act="ci-failed">CI failed</button>
                <button type="button" class="cfu-action-btn" data-act="blocked-dev">Blocked</button>
                <button type="button" class="cfu-action-btn" data-act="env-issue">Env issue</button>
                <button type="button" class="cfu-action-btn" data-act="incident-dev">Prod/admin issue</button>
                <button type="button" class="cfu-action-btn" data-act="release-ready">Ready deploy</button>
                <button type="button" class="cfu-action-btn" data-act="docs-pending">Docs pending</button>
                <button type="button" class="cfu-action-btn" data-act="start-focus">Start focus</button>
                <button type="button" class="cfu-action-btn" data-act="snooze">Snooze +1d</button>
                <button type="button" class="cfu-action-btn" data-act="note">Note</button>
                <button type="button" class="cfu-action-btn is-primary" data-act="done">${esc(config.doneLabel)}</button>
                <button type="button" class="cfu-action-btn is-danger" data-act="delete">Delete</button>
              </div>
            </div>
          ` : ''}
        </div>`;
    }

    function hrWorkspaceButtons(item) {
      const links = getHRWorkspaceLinks(item);
      if (!links.length) return '';
      return `
        <div class="pd-workspace-links">
          <button type="button" class="cfu-action-btn is-primary" data-act="open-workspace">Open workspace</button>
          ${links.map(([key, label]) => `<button type="button" class="cfu-action-btn" data-act="open-${esc(key)}">${esc(label)}</button>`).join('')}
        </div>
      `;
    }

    function hrChecklistHtml(item) {
      const entries = hrChecklistItems(item);
      if (!entries.length) return '';
      const done = Array.isArray(item.checklistDone) ? item.checklistDone : [];
      return `
        <div class="pd-launch-checklist pd-hr-checklist">
          ${entries.map((entry, index) => {
            const checked = done.includes(index);
            return `<button type="button" class="pd-check${checked ? ' is-done' : ''}" data-act="check-${index}">${checked ? '[x] ' : ''}${esc(entry)}</button>`;
          }).join('')}
        </div>
      `;
    }

    function hrItemHtml(item) {
      const isOpen = item.id === openId;
      const workflow = hrWorkflowType(item);
      const workflowLabel = optionLabel('workflowType', workflow);
      const waitDays = hrWaitingDays(item);
      const nearestDate = hrNearestDate(item);
      const until = hrNearestDaysUntil(item);
      const isLate = isPast(nearestDate);
      const missingCount = hrMissingCount(item);
      const waiting = hrIsWaiting(item);
      const risk = isHRChecklistRisk(item);
      const noNext = hasNoHRNextStep(item) ? '<span class="pd-chip is-danger">no next action</span>' : '';
      const dueLabel = nearestDate
        ? (isLate ? 'overdue' : isToday(nearestDate) ? 'today' : until <= 3 ? `due ${until}d` : nearestDate)
        : '';
      const due = nearestDate ? `<span class="pd-chip${isLate || risk ? ' is-danger' : until <= 3 ? ' is-warn' : ''}">${esc(dueLabel)}</span>` : '';
      const waitChip = waiting && waitDays > 0 ? `<span class="pd-chip is-warn">waiting ${waitDays}d</span>` : '';
      const missingChip = missingCount > 0 ? `<span class="pd-chip${risk ? ' is-danger' : ' is-warn'}">${missingCount} open</span>` : '';
      const workflowChip = workflow ? `<span class="pd-chip">${esc(workflowLabel)}</span>` : '';
      const waitingOnChip = item.waitingOn && item.waitingOn !== 'none' ? `<span class="pd-chip is-warn">waiting ${esc(optionLabel('waitingOn', item.waitingOn))}</span>` : '';
      const requestChip = item.requestType ? `<span class="pd-chip">${esc(optionLabel('requestType', item.requestType))}</span>` : '';
      const leaveChip = item.leaveType && workflow === 'leave' ? `<span class="pd-chip">${esc(optionLabel('leaveType', item.leaveType))}</span>` : '';
      const checklist = hrChecklistHtml(item);
      const workspace = hrWorkspaceButtons(item);
      const next = item.next || '<span style="color:var(--text-muted)">No next action</span>';
      const workflowActions = [
        '<button type="button" class="cfu-action-btn" data-act="hr-wait-employee">Waiting employee</button>',
        '<button type="button" class="cfu-action-btn" data-act="hr-wait-manager">Waiting manager</button>',
        '<button type="button" class="cfu-action-btn" data-act="hr-wait-it">Waiting IT</button>',
        '<button type="button" class="cfu-action-btn" data-act="hr-wait-vendor">Waiting vendor/system</button>',
        '<button type="button" class="cfu-action-btn" data-act="hr-reminded">Reminded today</button>',
        workflow === 'onboarding' ? '<button type="button" class="cfu-action-btn" data-act="hr-ready-day1">Ready day 1</button>' : '',
        workflow === 'leave' ? '<button type="button" class="cfu-action-btn" data-act="hr-ready-return">Returning soon</button>' : '',
        workflow === 'benefits' ? '<button type="button" class="cfu-action-btn" data-act="hr-benefit-complete">Benefits complete</button>' : '',
        workflow === 'offboarding' ? '<button type="button" class="cfu-action-btn" data-act="hr-offboarding-open">Offboarding open</button>' : ''
      ].filter(Boolean).join('');
      const summary = [
        workflowLabel,
        item.role,
        item.missingItems || item.context,
        item.blocker,
        item.next
      ].filter(Boolean).join(' - ');

      return `
        <div class="cfu-item pd-item pd-hr-item${isOpen ? ' is-open' : ''}" data-id="${esc(item.id)}">
          <div class="cfu-item-summary pd-item-summary" data-act="toggle">
            <div class="pd-item-main">
              <span class="cfu-item-name">${esc(item.name)}</span>
              <span class="cfu-item-deal">${esc(summary)}</span>
            </div>
            <div class="pd-item-meta">
              <span class="pd-chip">${esc(statusLabel(item.status))}</span>
              ${workflowChip}
              ${requestChip}
              ${leaveChip}
              ${due}
              ${waitChip}
              ${waitingOnChip}
              ${missingChip}
              ${noNext}
            </div>
          </div>
          ${isOpen ? `
            <div class="cfu-item-detail pd-hr-detail">
              ${salesDetailRow('Workflow', esc(workflowLabel || ''))}
              ${salesDetailRow('Employee / role', esc([item.name, item.role].filter(Boolean).join(' - ')))}
              ${salesDetailRow('Status', esc(statusLabel(item.status)))}
              ${salesDetailRow('Next', next)}
              ${salesDetailRow('Due / key date', esc(nearestDate || item.date || 'Not set'))}
              ${salesDetailRow('Onboarding start', esc(item.startDate || ''))}
              ${salesDetailRow('Offboarding last day', esc(item.lastDay || ''))}
              ${salesDetailRow('Leave window', esc([item.leaveStart, item.leaveEnd].filter(Boolean).join(' -> ')))}
              ${salesDetailRow('Return date', esc(item.returnDate || ''))}
              ${salesDetailRow('Benefit deadline', esc(item.benefitDeadline || ''))}
              ${salesDetailRow('Request type', esc(optionLabel('requestType', item.requestType || '')))}
              ${salesDetailRow('Waiting on', esc(optionLabel('waitingOn', item.waitingOn || '')))}
              ${item.waitingSince ? salesDetailRow('Waiting since', `${esc(item.waitingSince)}${waitDays > 0 ? ` (${waitDays}d)` : ''}`) : ''}
              ${salesDetailRow('Last reminder', esc(item.lastReminder || ''))}
              ${salesDetailRow('Missing items', esc(item.missingItems || item.context || ''))}
              ${salesDetailRow('Blocker / risk', esc(item.blocker || ''))}
              ${checklist ? salesDetailRow('HR checklist', checklist) : ''}
              ${workspace ? salesDetailRow('Workspace links', workspace) : ''}
              ${item.note ? salesDetailRow('Note', esc(item.note)) : ''}
              <div class="cfu-item-actions">
                ${workflowActions}
                <button type="button" class="cfu-action-btn" data-act="snooze">Snooze +1d</button>
                <button type="button" class="cfu-action-btn" data-act="note">Note</button>
                <button type="button" class="cfu-action-btn is-primary" data-act="done">${esc(config.doneLabel)}</button>
                <button type="button" class="cfu-action-btn is-danger" data-act="delete">Delete</button>
              </div>
            </div>
          ` : ''}
        </div>`;
    }

    function salesWorkspaceButtons(item) {
      const links = getWorkspaceLinks(item);
      if (!links.length) return '';
      return `
        <div class="pd-workspace-links">
          ${links.map(([key, label]) => `<button type="button" class="cfu-action-btn" data-act="open-${esc(key)}">${esc(label)}</button>`).join('')}
        </div>
      `;
    }

    function salesItemHtml(item) {
      const isOpen = item.id === openId;
      const lastTouchDays = salesLastTouchDays(item);
      const isLate = isPast(item.date);
      const next = item.next || '<span style="color:var(--text-muted)">No next step</span>';
      const due = item.date ? `<span class="pd-chip${isLate ? ' is-danger' : ''}">${esc(isLate ? 'overdue' : isToday(item.date) ? 'today' : item.date)}</span>` : '';
      const quiet = isQuietSalesLead(item) ? `<span class="pd-chip is-warn">Quiet for ${lastTouchDays}d</span>` : '';
      const noNext = hasNoSalesNextStep(item) ? '<span class="pd-chip is-danger">no next step</span>' : '';
      const staleProposal = isProposalStale(item) ? '<span class="pd-chip is-warn">proposal 3d+</span>' : '';
      const valueChip = numericValue(item.value) ? `<span class="pd-chip">$${esc(numericValue(item.value).toLocaleString())}</span>` : '';
      const callNoteItems = splitChecklist(item.checklist);
      const callNote = callNoteItems.length ? `
        <div class="pd-checklist">
          ${callNoteItems.map((entry) => `<span class="pd-check">${esc(entry)}</span>`).join('')}
        </div>
      ` : '';
      const summary = [
        statusLabel(item.status),
        item.pain || item.context,
        item.next
      ].filter(Boolean).join(' - ');

      return `
        <div class="cfu-item pd-item${isOpen ? ' is-open' : ''}" data-id="${esc(item.id)}">
          <div class="cfu-item-summary pd-item-summary" data-act="toggle">
            <div class="pd-item-main">
              <span class="cfu-item-name">${esc(item.name)}</span>
              <span class="cfu-item-deal">${esc(summary)}</span>
            </div>
            <div class="pd-item-meta">
              <span class="pd-chip">${esc(statusLabel(item.status))}</span>
              ${due}
              ${quiet}
              ${staleProposal}
              ${noNext}
              ${valueChip}
            </div>
          </div>
          ${isOpen ? `
            <div class="cfu-item-detail">
              ${salesDetailRow('Stage', esc(statusLabel(item.status)))}
              ${salesDetailRow('Next', next)}
              ${salesDetailRow('Follow-up', esc(item.date || 'Not set'))}
              ${salesDetailRow('Last touch', item.lastTouch ? `${esc(item.lastTouch)}${lastTouchDays > 0 ? ` (${lastTouchDays}d ago)` : ''}` : '')}
              ${numericValue(item.value) ? salesDetailRow('Value', `$${esc(numericValue(item.value).toLocaleString())}`) : ''}
              ${salesDetailRow('Pain / interest', esc(item.pain || item.context || ''))}
              ${salesDetailRow('Objection', esc(item.objection || ''))}
              ${salesDetailRow('Decision maker', esc(item.decisionMaker || ''))}
              ${callNote ? salesDetailRow('Call note', callNote) : ''}
              ${salesWorkspaceButtons(item) ? salesDetailRow('Workspace', salesWorkspaceButtons(item)) : ''}
              ${item.note ? salesDetailRow('Note', esc(item.note)) : ''}
              <div class="cfu-item-actions">
                <button type="button" class="cfu-action-btn" data-act="copy">${esc(config.copyLabel)}</button>
                <button type="button" class="cfu-action-btn" data-act="followup-date">Add follow-up date</button>
                <button type="button" class="cfu-action-btn" data-act="snooze">Snooze +1d</button>
                <button type="button" class="cfu-action-btn" data-act="note">Note</button>
                <button type="button" class="cfu-action-btn is-primary" data-act="done">${esc(config.doneLabel)}</button>
                <button type="button" class="cfu-action-btn is-danger" data-act="lost">Mark lost</button>
                <button type="button" class="cfu-action-btn is-danger" data-act="delete">Delete</button>
              </div>
            </div>
          ` : ''}
        </div>`;
    }

    function marketingWorkspaceButtons(item) {
      const links = getMarketingWorkspaceLinks(item);
      if (!links.length) return '';
      return `
        <div class="pd-workspace-links">
          <button type="button" class="cfu-action-btn is-primary" data-act="open-workspace">Open workspace</button>
          ${links.map(([key, label]) => `<button type="button" class="cfu-action-btn" data-act="open-${esc(key)}">${esc(label)}</button>`).join('')}
        </div>
      `;
    }

    function marketingChecklistHtml(item) {
      const checklistItems = splitChecklist(item.checklist || (config.defaultChecklist || []).join('\n'));
      if (!checklistItems.length) return '';
      const done = Array.isArray(item.checklistDone) ? item.checklistDone : [];
      return `
        <div class="pd-launch-checklist">
          ${checklistItems.map((entry, index) => {
            const checked = done.includes(index);
            return `<button type="button" class="pd-check${checked ? ' is-done' : ''}" data-act="check-${index}">${checked ? '[x] ' : ''}${esc(entry)}</button>`;
          }).join('')}
        </div>
      `;
    }

    function marketingItemHtml(item) {
      const isOpen = item.id === openId;
      const isLate = isPast(item.date);
      const waitDays = marketingWaitingDays(item);
      const metricLate = isMetricOverdue(item);
      const launchSoon = isLaunchSoon(item);
      const noNext = hasNoMarketingNextStep(item) ? '<span class="pd-chip is-danger">no next action</span>' : '';
      const due = item.date ? `<span class="pd-chip${isLate ? ' is-danger' : launchSoon ? ' is-warn' : ''}">${esc(isLate ? 'overdue' : isToday(item.date) ? 'today' : launchSoon ? 'launch soon' : item.date)}</span>` : '';
      const approval = isMarketingApprovalBlocked(item) && waitDays > 0 ? `<span class="pd-chip is-warn">Waiting ${waitDays}d</span>` : '';
      const metric = metricLate ? '<span class="pd-chip is-warn">metric check</span>' : '';
      const channel = item.channel ? `<span class="pd-chip">${esc(optionLabel('channel', item.channel))}</span>` : '';
      const checklist = marketingChecklistHtml(item);
      const next = item.next || '<span style="color:var(--text-muted)">No next action</span>';
      const summary = [
        optionLabel('channel', item.channel),
        item.context,
        item.next
      ].filter(Boolean).join(' - ');

      return `
        <div class="cfu-item pd-item${isOpen ? ' is-open' : ''}" data-id="${esc(item.id)}">
          <div class="cfu-item-summary pd-item-summary" data-act="toggle">
            <div class="pd-item-main">
              <span class="cfu-item-name">${esc(item.name)}</span>
              <span class="cfu-item-deal">${esc(summary)}</span>
            </div>
            <div class="pd-item-meta">
              <span class="pd-chip">${esc(statusLabel(item.status))}</span>
              ${channel}
              ${due}
              ${approval}
              ${metric}
              ${noNext}
            </div>
          </div>
          ${isOpen ? `
            <div class="cfu-item-detail">
              ${salesDetailRow('Channel', esc(optionLabel('channel', item.channel || '')))}
              ${salesDetailRow('Status', esc(statusLabel(item.status)))}
              ${salesDetailRow('Next', next)}
              ${salesDetailRow('Due', esc(item.date || 'Not set'))}
              ${salesDetailRow('Owner / blocker', esc(item.ownerBlocker || ''))}
              ${item.waitingSince ? salesDetailRow('Waiting since', `${esc(item.waitingSince)}${waitDays > 0 ? ` (${waitDays}d)` : ''}`) : ''}
              ${salesDetailRow('Angle / notes', esc(item.context || ''))}
              ${salesDetailRow('Metric to check', esc(item.metricToCheck || ''))}
              ${salesDetailRow('Metric due', esc(item.metricDue || ''))}
              ${checklist ? salesDetailRow('Launch checklist', checklist) : ''}
              ${marketingWorkspaceButtons(item) ? salesDetailRow('Workspace', marketingWorkspaceButtons(item)) : ''}
              ${item.note ? salesDetailRow('Note', esc(item.note)) : ''}
              <div class="cfu-item-actions">
                <button type="button" class="cfu-action-btn" data-act="copy">${esc(config.copyLabel)}</button>
                <button type="button" class="cfu-action-btn" data-act="start-focus">Start focus</button>
                <button type="button" class="cfu-action-btn" data-act="snooze">Snooze +1d</button>
                <button type="button" class="cfu-action-btn" data-act="note">Add note</button>
                ${item.status === 'approval' ? '<button type="button" class="cfu-action-btn is-primary" data-act="approved">Mark approved</button>' : ''}
                ${isMarketingApprovalBlocked(item) ? '<button type="button" class="cfu-action-btn" data-act="changes-requested">Changes requested</button>' : ''}
                ${item.status === 'scheduled' ? '<button type="button" class="cfu-action-btn is-primary" data-act="published">Mark published</button>' : ''}
                ${['published', 'measure'].includes(item.status) ? '<button type="button" class="cfu-action-btn is-primary" data-act="metric-check">Metric checked</button>' : ''}
                <button type="button" class="cfu-action-btn is-primary" data-act="done">${esc(config.doneLabel)}</button>
                <button type="button" class="cfu-action-btn is-danger" data-act="delete">Delete</button>
              </div>
            </div>
          ` : ''}
        </div>`;
    }

    function designWorkspaceButtons(item) {
      const links = getDesignWorkspaceLinks(item);
      if (!links.length) return '';
      return `
        <div class="pd-workspace-links">
          <button type="button" class="cfu-action-btn is-primary" data-act="open-workspace">Open workspace</button>
          ${links.map(([key, label]) => `<button type="button" class="cfu-action-btn" data-act="open-${esc(key)}">${esc(label)}</button>`).join('')}
        </div>
      `;
    }

    function designChecklistHtml(item) {
      const checklistItems = designChecklistItems(item, config);
      if (!checklistItems.length) return '';
      const done = Array.isArray(item.checklistDone) ? item.checklistDone : [];
      return `
        <div class="pd-launch-checklist">
          ${checklistItems.map((entry, index) => {
            const checked = done.includes(index);
            return `<button type="button" class="pd-check${checked ? ' is-done' : ''}" data-act="check-${index}">${checked ? '[x] ' : ''}${esc(entry)}</button>`;
          }).join('')}
        </div>
      `;
    }

    function designItemHtml(item) {
      const isOpen = item.id === openId;
      const isLate = isPast(item.date);
      const waitDays = designWaitingDays(item);
      const currentRevision = designRevisionCurrent(item);
      const revisionLimit = designRevisionLimit(item);
      const revisionText = revisionLimit ? `${currentRevision}/${revisionLimit}` : (currentRevision ? String(currentRevision) : '');
      const revisionReached = isDesignRevisionLimitReached(item);
      const handoffIncomplete = isDesignHandoffIncomplete(item, config);
      const noNext = hasNoDesignNextStep(item) ? '<span class="pd-chip is-danger">no next action</span>' : '';
      const due = item.date ? `<span class="pd-chip${isLate ? ' is-danger' : isToday(item.date) ? ' is-warn' : ''}">${esc(isLate ? 'overdue' : isToday(item.date) ? 'today' : item.date)}</span>` : '';
      const waiting = waitDays > 0 ? `<span class="pd-chip is-warn">Waiting ${waitDays}d</span>` : '';
      const revisionChip = revisionText ? `<span class="pd-chip${revisionReached ? ' is-danger' : ''}">Rev ${esc(revisionText)}</span>` : '';
      const limitChip = revisionReached ? `<span class="pd-chip is-danger">${currentRevision > revisionLimit ? 'revision exceeded' : 'revision limit'}</span>` : '';
      const handoffChip = handoffIncomplete ? '<span class="pd-chip is-warn">handoff checklist</span>' : '';
      const source = item.source ? `<span class="pd-chip">${esc(optionLabel('source', item.source))}</span>` : '';
      const feedbackType = item.feedbackType ? `<span class="pd-chip">${esc(optionLabel('feedbackType', item.feedbackType))}</span>` : '';
      const feedbackState = item.feedbackStatus ? `<span class="pd-chip">${esc(optionLabel('feedbackStatus', item.feedbackStatus))}</span>` : '';
      const checklist = designChecklistHtml(item);
      const next = item.next || '<span style="color:var(--text-muted)">No next action</span>';
      const summary = [
        item.version,
        optionLabel('source', item.source),
        item.context,
        item.intent
      ].filter(Boolean).join(' - ');

      return `
        <div class="cfu-item pd-item${isOpen ? ' is-open' : ''}" data-id="${esc(item.id)}">
          <div class="cfu-item-summary pd-item-summary" data-act="toggle">
            <div class="pd-item-main">
              <span class="cfu-item-name">${esc(item.name)}</span>
              <span class="cfu-item-deal">${esc(summary || item.next || '')}</span>
            </div>
            <div class="pd-item-meta">
              <span class="pd-chip">${esc(statusLabel(item.status))}</span>
              ${source}
              ${feedbackType}
              ${feedbackState}
              ${due}
              ${waiting}
              ${revisionChip}
              ${limitChip}
              ${handoffChip}
              ${noNext}
            </div>
          </div>
          ${isOpen ? `
            <div class="cfu-item-detail">
              ${salesDetailRow('Status', esc(statusLabel(item.status)))}
              ${salesDetailRow('Next', next)}
              ${salesDetailRow('Due', esc(item.date || 'Not set'))}
              ${salesDetailRow('Feedback', esc(item.context || ''))}
              ${salesDetailRow('Intent / problem', esc(item.intent || ''))}
              ${salesDetailRow('Source', esc(optionLabel('source', item.source || '')))}
              ${salesDetailRow('Type', esc(optionLabel('feedbackType', item.feedbackType || '')))}
              ${salesDetailRow('Feedback status', esc(optionLabel('feedbackStatus', item.feedbackStatus || '')))}
              ${salesDetailRow('Version', esc(item.version || ''))}
              ${revisionText ? salesDetailRow('Revision', `${esc(revisionText)}${revisionReached ? ` <span class="pd-inline-warning">${currentRevision > revisionLimit ? 'Limit exceeded' : 'Limit reached'}</span>` : ''}`) : ''}
              ${item.waitingSince ? salesDetailRow('Waiting since', `${esc(item.waitingSince)}${waitDays > 0 ? ` (${waitDays}d)` : ''}`) : ''}
              ${checklist ? salesDetailRow('Handoff checklist', checklist) : ''}
              ${designWorkspaceButtons(item) ? salesDetailRow('Workspace', designWorkspaceButtons(item)) : ''}
              ${item.note ? salesDetailRow('Note', esc(item.note)) : ''}
              <div class="cfu-item-actions">
                <button type="button" class="cfu-action-btn" data-act="start-focus">Start focus</button>
                <button type="button" class="cfu-action-btn" data-act="feedback-clarify">Need clarification</button>
                <button type="button" class="cfu-action-btn" data-act="feedback-accept">Accept feedback</button>
                <button type="button" class="cfu-action-btn" data-act="feedback-done">Feedback done</button>
                <button type="button" class="cfu-action-btn" data-act="revision-done">Mark revision done</button>
                ${item.status === 'approval' ? '<button type="button" class="cfu-action-btn is-primary" data-act="design-approved">Mark approved</button>' : ''}
                ${item.status !== 'handoff' && item.status !== 'approved' ? '<button type="button" class="cfu-action-btn is-primary" data-act="ready-handoff">Ready for handoff</button>' : ''}
                <button type="button" class="cfu-action-btn" data-act="changes-requested">Changes requested</button>
                <button type="button" class="cfu-action-btn" data-act="snooze">Snooze +1d</button>
                <button type="button" class="cfu-action-btn" data-act="note">Add note</button>
                <button type="button" class="cfu-action-btn is-primary" data-act="done">${esc(config.doneLabel)}</button>
                <button type="button" class="cfu-action-btn is-danger" data-act="delete">Delete</button>
              </div>
            </div>
          ` : ''}
        </div>`;
    }

    function bindItemEvents() {
      els.body.querySelectorAll('.pd-item').forEach((node) => {
        const id = node.dataset.id;
        node.querySelectorAll('[data-act]').forEach((btn) => {
          btn.addEventListener('click', (event) => {
            event.stopPropagation();
            handleAction(id, btn.dataset.act);
          });
        });
      });
    }

    function handleAction(id, act) {
      const idx = items.findIndex((item) => item.id === id);
      if (idx < 0) return;
      const item = items[idx];

      if (act === 'open-workspace') {
        const links = isDesign(config)
          ? getDesignWorkspaceLinks(item)
          : isAccounting(config)
            ? getAccountingWorkspaceLinks(item)
            : isPurchasing(config)
              ? getPurchasingWorkspaceLinks(item)
              : isHR(config)
                ? getHRWorkspaceLinks(item)
                : isDeveloper(config)
                  ? getDeveloperWorkspaceLinks(item)
                  : getMarketingWorkspaceLinks(item);
        links.forEach(([, , url]) => chrome.tabs.create({ url }));
        return;
      }

      if (act.startsWith('open-')) {
        const key = act.slice(5);
        const url = item[key];
        if (url) chrome.tabs.create({ url });
        return;
      }

      if (act.startsWith('check-')) {
        const checklistIndex = Number(act.slice(6));
        const done = Array.isArray(item.checklistDone) ? item.checklistDone : [];
        item.checklistDone = done.includes(checklistIndex)
          ? done.filter((index) => index !== checklistIndex)
          : [...done, checklistIndex].sort((a, b) => a - b);
        if (isAccounting(config) && accountingMissingCount(item) === 0 && ['collecting', 'waiting'].includes(item.status)) {
          item.status = 'progress';
          item.waitingSince = '';
          item.next = item.next || 'Continue accounting work';
        }
        if (isPurchasing(config) && purchasingChecklistMissing(item) === 0 && ['missing', 'vendor', 'approval', 'quote_requested'].includes(item.status)) {
          item.status = 'under_review';
          item.waitingSince = '';
          item.next = item.next || 'Review purchasing item and move to the next step';
        }
        if (isDeveloper(config) && developerChecklistMissing(item) === 0 && ['ci_failed', 'release', 'docs'].includes(item.status)) {
          item.status = item.status === 'release' ? 'done' : 'coding';
          item.waitingSince = '';
          item.next = item.next || 'Continue development flow';
        }
        if (isHR(config) && hrMissingCount(item) === 0) {
          const workflow = hrWorkflowType(item);
          item.waitingSince = '';
          if (workflow === 'onboarding' && !['ready_day1', 'completed', 'done'].includes(item.status)) {
            item.status = 'ready_day1';
            item.next = item.next || 'Confirm day 1 readiness';
          } else if (workflow === 'benefits' && !['benefits_complete', 'completed', 'done'].includes(item.status)) {
            item.status = 'benefits_complete';
            item.next = item.next || 'Archive benefit enrollment item';
          } else if (workflow === 'request' && !['completed', 'done'].includes(item.status)) {
            item.status = 'completed';
            item.next = item.next || 'Close employee request';
          } else if (workflow === 'offboarding' && !['final_items', 'completed', 'done'].includes(item.status)) {
            item.status = 'final_items';
            item.next = item.next || 'Review final offboarding items';
          } else if (workflow === 'leave' && !['leave_approved', 'completed', 'done'].includes(item.status)) {
            item.status = 'leave_approved';
            item.next = item.next || 'Track return date';
          }
        }
        item.updatedAt = Date.now();
        persist();
        render();
        return;
      }

      switch (act) {
        case 'toggle':
          openId = openId === id ? null : id;
          break;
        case 'open':
          if (item.link) chrome.tabs.create({ url: item.link });
          return;
        case 'copy':
          try { navigator.clipboard.writeText(config.snippet(item)); } catch (_) {}
          flash(`Copied snippet for ${item.name}`);
          return;
        case 'snooze':
          item.date = addDays(1);
          break;
        case 'start-focus': {
          const focusInput = document.getElementById('focus-context-input');
          if (focusInput) {
            focusInput.value = item.next || item.name;
            focusInput.dispatchEvent(new Event('input', { bubbles: true }));
          }
          flash(`Focus ready for ${item.name}`);
          return;
        }
        case 'followup-date': {
          const date = prompt('Follow-up date (YYYY-MM-DD):', item.date || todayStr());
          if (date == null) return;
          item.date = date.trim() || todayStr();
          if (!item.next) item.next = 'Send follow-up';
          break;
        }
        case 'note': {
          const note = prompt('Note:', item.note || '');
          if (note == null) return;
          item.note = note.trim();
          break;
        }
        case 'hr-wait-employee':
          item.status = 'waiting_employee';
          item.waitingOn = 'employee';
          item.waitingSince = item.waitingSince || todayStr();
          item.next = item.next || 'Follow up with employee';
          break;
        case 'hr-wait-manager':
          item.status = hrWorkflowType(item) === 'offboarding' ? 'offboarding_waiting' : 'waiting_manager';
          item.waitingOn = 'manager';
          item.waitingSince = item.waitingSince || todayStr();
          item.next = item.next || 'Follow up with manager';
          break;
        case 'hr-wait-it':
          item.status = hrWorkflowType(item) === 'offboarding' ? 'access_equipment' : 'waiting_it';
          item.waitingOn = 'it';
          item.waitingSince = item.waitingSince || todayStr();
          item.next = item.next || 'Follow up with IT';
          break;
        case 'hr-wait-vendor':
          item.status = 'waiting_vendor';
          item.waitingOn = item.waitingOn || 'vendor';
          item.waitingSince = item.waitingSince || todayStr();
          item.next = item.next || 'Follow up with vendor or system owner';
          break;
        case 'hr-reminded':
          item.lastReminder = todayStr();
          item.waitingSince = item.waitingSince || todayStr();
          if (hrWorkflowType(item) === 'benefits') item.status = 'reminder_sent';
          if (!item.next) item.next = 'Check for response after reminder';
          break;
        case 'hr-ready-day1':
          item.workflowType = item.workflowType || 'onboarding';
          item.status = 'ready_day1';
          item.waitingSince = '';
          item.waitingOn = 'none';
          item.next = item.next || 'Confirm day 1 plan and archive onboarding checklist';
          break;
        case 'hr-ready-return':
          item.workflowType = item.workflowType || 'leave';
          item.status = 'returning_soon';
          item.waitingSince = '';
          item.next = item.next || 'Send return-to-work reminder';
          break;
        case 'hr-benefit-complete':
          item.workflowType = item.workflowType || 'benefits';
          item.status = 'benefits_complete';
          item.waitingSince = '';
          item.waitingOn = 'none';
          item.next = item.next || 'Archive enrollment item';
          break;
        case 'hr-offboarding-open':
          item.workflowType = 'offboarding';
          item.status = 'offboarding_open';
          item.next = item.next || 'Complete access, equipment, payroll and benefits checklist';
          break;
        case 'waiting':
          item.status = 'waiting';
          item.waitingSince = item.waitingSince || todayStr();
          item.next = item.next || 'Wait for client documents or answers';
          break;
        case 'info':
          item.status = 'info';
          item.waitingSince = item.waitingSince || todayStr();
          item.next = item.next || 'Send client questions list';
          break;
        case 'last-reminder':
          item.lastReminder = todayStr();
          item.waitingSince = item.waitingSince || todayStr();
          if (['collecting', 'progress'].includes(item.status)) item.status = 'waiting';
          break;
        case 'review':
          item.status = 'review';
          item.waitingSince = '';
          item.next = item.next || 'Review reconciliation and reports';
          break;
        case 'ready':
          item.status = 'ready';
          item.waitingSince = '';
          item.next = item.next || 'File, send, or deliver to client';
          break;
        case 'waiting-supplier':
          item.status = 'vendor';
          item.waitOn = 'supplier';
          item.waitingSince = item.waitingSince || todayStr();
          item.next = item.next || 'Request supplier confirmation or ETA update';
          break;
        case 'waiting-approval':
          item.status = 'approval';
          item.waitOn = 'approver';
          item.waitingSince = item.waitingSince || todayStr();
          item.next = item.next || 'Follow up with approver';
          break;
        case 'missing-info':
          item.status = 'missing';
          item.waitOn = item.waitOn || 'requester';
          item.waitingSince = item.waitingSince || todayStr();
          item.next = item.next || 'Collect missing request details';
          break;
        case 'purchase-approved':
          item.status = 'approved';
          item.waitingSince = '';
          item.next = item.next || 'Issue PO or notify requester';
          break;
        case 'po-sent':
          item.status = 'po_sent';
          item.sentDate = item.sentDate || todayStr();
          item.ackStatus = item.ackStatus === 'ack' ? 'ack' : 'not_ack';
          item.waitOn = 'supplier';
          item.waitingSince = item.waitingSince || todayStr();
          item.next = item.next || 'Request PO acknowledgement and ETA';
          break;
        case 'po-ack':
          item.ackStatus = 'ack';
          item.status = 'confirmed';
          item.waitingSince = '';
          item.next = item.next || 'Track confirmed ETA and delivery';
          break;
        case 'quote-received':
          item.quoteReceived = String(numericValue(item.quoteReceived) + 1);
          item.status = purchasingMissingQuotes(item) > 0 ? 'quote_requested' : 'under_review';
          item.next = purchasingMissingQuotes(item) > 0 ? 'Follow up on remaining quote responses' : 'Review quotes and select vendor';
          break;
        case 'delivery-risk':
          item.status = 'delivery';
          item.waitOn = item.waitOn || 'supplier';
          item.next = item.next || 'Confirm delivery ETA and receiving plan';
          break;
        case 'delivered':
          item.status = 'delivered';
          item.waitingSince = '';
          item.next = item.next || 'Confirm receipt and invoice match';
          break;
        case 'invoice-issue':
          item.status = 'invoice';
          item.issueType = item.issueType || 'price';
          item.waitOn = item.waitOn || 'ap';
          item.next = item.next || 'Resolve PO/receipt/invoice mismatch';
          break;
        case 'last-followup':
          item.lastFollowup = todayStr();
          item.waitingSince = item.waitingSince || todayStr();
          if (['po', 'po_sent'].includes(item.status)) item.status = 'vendor';
          break;
        case 'ready-close':
          item.status = 'ready_close';
          item.waitingSince = '';
          item.next = item.next || 'Confirm receipt/invoice match and close item';
          break;
        case 'resume-coding':
          item.status = 'coding';
          item.devType = item.devType || 'feature';
          item.lastActivity = todayStr();
          item.next = item.next || item.resumeNote || 'Resume implementation from saved context';
          break;
        case 'pr-waiting':
          item.status = 'pr_open';
          item.devType = 'pr';
          item.prStatus = 'waiting';
          item.blockerType = 'review';
          item.waitingSince = item.waitingSince || todayStr();
          item.next = item.next || 'Follow up on PR review';
          break;
        case 'changes-requested-dev':
          item.status = 'changes';
          item.devType = 'pr';
          item.prStatus = 'changes';
          item.waitingSince = '';
          item.next = item.next || 'Address requested PR changes';
          break;
        case 'ci-failed':
          item.status = 'ci_failed';
          item.devType = 'ci';
          item.ciType = item.ciType || 'test';
          item.ciLastRun = item.ciLastRun || todayStr();
          item.next = item.next || 'Inspect CI logs and reproduce locally';
          break;
        case 'blocked-dev':
          item.status = 'blocked';
          item.blockerType = item.blockerType || 'spec';
          item.waitingSince = item.waitingSince || todayStr();
          item.next = item.next || 'Clarify blocker and unblock implementation';
          break;
        case 'env-issue':
          item.status = 'env_issue';
          item.devType = 'env';
          item.blockerType = 'env';
          item.waitingSince = item.waitingSince || todayStr();
          item.next = item.next || 'Fix local/dev environment and record workaround';
          break;
        case 'incident-dev':
          item.status = 'incident';
          item.devType = 'incident';
          item.risk = item.risk || 'prod';
          item.environment = item.environment || 'production';
          item.next = item.next || 'Check logs, reproduce, and assess risk';
          break;
        case 'release-ready':
          item.status = 'release';
          item.devType = 'release';
          item.risk = item.risk || 'release';
          item.next = item.next || 'Run release checklist and deploy checks';
          break;
        case 'docs-pending':
          item.status = 'docs';
          item.devType = 'docs';
          item.next = item.next || 'Update docs, runbook, or release note';
          break;
        case 'feedback-clarify':
          item.feedbackStatus = 'clarify';
          item.status = 'feedback';
          item.waitingSince = item.waitingSince || todayStr();
          item.next = item.next || 'Clarify the feedback intent before revising';
          break;
        case 'feedback-accept':
          item.feedbackStatus = 'accepted';
          item.status = 'changes';
          item.waitingSince = '';
          item.next = item.next || 'Apply accepted feedback and send updated version';
          break;
        case 'feedback-done':
          item.feedbackStatus = 'done';
          if (item.status === 'changes' || item.status === 'feedback') item.status = 'internal';
          item.waitingSince = '';
          item.next = item.next || 'Send updated version for review';
          break;
        case 'revision-done': {
          const nextRevision = designRevisionCurrent(item) + 1;
          item.currentRevision = String(nextRevision);
          item.waitingSince = '';
          if (!item.version) item.version = `v${nextRevision}`;
          if (designRevisionLimit(item) && nextRevision >= designRevisionLimit(item)) {
            item.status = 'approval';
            item.next = 'Confirm final approval or create a change request';
          } else {
            item.status = 'internal';
            item.next = item.next || 'Review revised version internally';
          }
          break;
        }
        case 'design-approved':
          item.status = 'approved';
          item.feedbackStatus = item.feedbackStatus || 'done';
          item.waitingSince = '';
          item.next = item.next || 'Prepare final handoff or archive';
          if (openId === id) openId = null;
          break;
        case 'ready-handoff':
          item.status = 'handoff';
          item.waitingSince = '';
          item.next = item.next || 'Complete handoff checklist and send package';
          break;
        case 'done':
          item.status = 'done';
          if (openId === id) openId = null;
          break;
        case 'approved':
          item.status = 'scheduled';
          item.waitingSince = '';
          if (!item.next) item.next = 'Schedule and publish';
          break;
        case 'changes-requested':
          item.status = 'changes';
          item.waitingSince = '';
          if (isDesign(config)) {
            item.feedbackStatus = item.feedbackStatus || 'accepted';
            if (!item.next) item.next = 'Revise selected feedback and send back for review';
          } else {
            item.waitingSince = todayStr();
            if (!item.next) item.next = 'Revise asset and send back for approval';
          }
          break;
        case 'published':
          item.status = 'published';
          item.metricDue = addDays(1);
          if (!item.metricToCheck) item.metricToCheck = 'CTR, leads, clicks, rankings or conversions';
          if (!item.next) item.next = 'Check first performance signals';
          break;
        case 'metric-check':
          item.status = 'measure';
          item.metricDue = addDays(7);
          item.next = 'Check next performance window';
          break;
        case 'lost':
          if (!confirm(`Mark "${item.name}" as lost?`)) return;
          item.status = 'closed';
          item.outcome = 'lost';
          if (openId === id) openId = null;
          break;
        case 'delete':
          if (!confirm(`Delete "${item.name}"?`)) return;
          items.splice(idx, 1);
          if (openId === id) openId = null;
          break;
      }

      item.updatedAt = Date.now();
      persist();
      render();
    }

    function showForm(show) {
      els.form.hidden = !show;
      if (show) {
        els.date.value = todayStr();
        if (els.status && config.defaultStatus) els.status.value = config.defaultStatus;
        if (isDesign(config)) {
          if (extraEls.source) extraEls.source.value = 'figma';
          if (extraEls.feedbackType) extraEls.feedbackType.value = 'visual';
          if (extraEls.feedbackStatus) extraEls.feedbackStatus.value = 'new';
          if (extraEls.currentRevision) extraEls.currentRevision.value = '1';
          if (extraEls.revisionLimit) extraEls.revisionLimit.value = '3';
        }
        if (isHR(config)) {
          if (extraEls.workflowType) extraEls.workflowType.value = 'onboarding';
          if (extraEls.waitingOn) extraEls.waitingOn.value = 'employee';
          if (extraEls.requestType) extraEls.requestType.value = 'document_request';
          if (extraEls.leaveType) extraEls.leaveType.value = 'pto';
        }
        setTimeout(() => els.name.focus(), 0);
      } else {
        els.name.value = '';
        els.context.value = '';
        els.next.value = '';
        els.link.value = '';
        if (els.checklist) els.checklist.value = '';
        Object.values(extraEls).forEach((input) => { if (input) input.value = ''; });
      }
    }

    els.addBtn.addEventListener('click', () => showForm(els.form.hidden));
    els.cancel.addEventListener('click', () => showForm(false));
    els.save.addEventListener('click', () => {
      const name = els.name.value.trim();
      if (!name) {
        els.name.focus();
        return;
      }

      const extraValues = Object.fromEntries(Object.entries(extraEls).map(([key, input]) => [key, input ? input.value.trim() : '']));
      if (isDesign(config)) {
        extraValues.currentRevision = extraValues.currentRevision || '1';
        extraValues.revisionLimit = extraValues.revisionLimit || '3';
        if (['feedback', 'approval'].includes(els.status.value) && !extraValues.waitingSince) extraValues.waitingSince = todayStr();
      }
      if (isAccounting(config)) {
        extraValues.questionCount = extraValues.questionCount || '0';
        extraValues.receiptCount = extraValues.receiptCount || '0';
        if (['waiting', 'info'].includes(els.status.value) && !extraValues.waitingSince) extraValues.waitingSince = todayStr();
      }
      if (isPurchasing(config)) {
        extraValues.purchasingType = extraValues.purchasingType || 'pr';
        extraValues.ackStatus = extraValues.ackStatus || 'unknown';
        extraValues.quoteRequested = extraValues.quoteRequested || '0';
        extraValues.quoteReceived = extraValues.quoteReceived || '0';
        extraValues.renewalWindow = extraValues.renewalWindow || '60';
        extraValues.waitOn = extraValues.waitOn || 'supplier';
        if (['missing', 'approval', 'vendor', 'quote_requested', 'quote_clarify', 'receipt', 'invoice'].includes(els.status.value) && !extraValues.waitingSince) {
          extraValues.waitingSince = todayStr();
        }
      }
      if (isDeveloper(config)) {
        extraValues.devType = extraValues.devType || 'feature';
        extraValues.environment = extraValues.environment || 'local';
        if (['blocked', 'clarify', 'pr_open', 'changes', 'env_issue'].includes(els.status.value) && !extraValues.waitingSince) {
          extraValues.waitingSince = todayStr();
        }
        if (!extraValues.lastActivity && ['coding', 'ci_failed', 'release', 'incident'].includes(els.status.value)) {
          extraValues.lastActivity = todayStr();
        }
      }
      if (isHR(config)) {
        extraValues.workflowType = extraValues.workflowType || 'onboarding';
        extraValues.waitingOn = extraValues.waitingOn || 'employee';
        if (['waiting_employee', 'waiting_manager', 'waiting_it', 'waiting_vendor', 'leave_pending', 'benefits_docs', 'offboarding_waiting'].includes(els.status.value) && !extraValues.waitingSince) {
          extraValues.waitingSince = todayStr();
        }
      }
      const checklistValue = els.checklist && els.checklist.value.trim()
        ? els.checklist.value.trim()
        : (isDeveloper(config)
          ? developerDefaultChecklist(extraValues.devType).join('\n')
          : (isPurchasing(config)
            ? purchasingDefaultChecklist(extraValues.purchasingType).join('\n')
            : (isAccounting(config)
              ? accountingDefaultChecklist(extraValues.workType).join('\n')
              : (isHR(config)
                ? hrDefaultChecklist(extraValues.workflowType).join('\n')
                : ((isMarketing(config) || isDesign(config)) ? (config.defaultChecklist || []).join('\n') : '')))));
      items.push({
        id: `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        name,
        context: els.context.value.trim(),
        pain: isSales(config) ? els.context.value.trim() : '',
        next: els.next.value.trim(),
        link: els.link.value.trim(),
        checklist: checklistValue,
        checklistDone: [],
        date: els.date.value || todayStr(),
        status: els.status.value || config.defaultStatus || 'due',
        note: '',
        ...extraValues,
        createdAtDate: todayStr(),
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      persist();
      showForm(false);
      render();
    });

    [els.name, els.context, els.next, els.link, ...Object.values(extraEls)].filter(Boolean).forEach((input) => {
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') els.save.click();
      });
    });

    els.openAll.addEventListener('click', (event) => {
      event.preventDefault();
      showForm(true);
    });

    load().then((data) => {
      items = data.map((item) => ({
        ...item,
        status: isHR(config)
          ? normalizeHRStatus(item.status || config.defaultStatus || 'due')
          : (isDeveloper(config)
            ? normalizeDeveloperStatus(item.status || config.defaultStatus || 'planned')
            : (isSales(config) && item.status === 'quiet' ? 'contacted' : (item.status || config.defaultStatus || 'due'))),
        pain: item.pain || (isSales(config) ? item.context : ''),
        lastTouch: item.lastTouch || '',
        value: item.value || '',
        objection: item.objection || '',
        decisionMaker: item.decisionMaker || '',
        crmUrl: item.crmUrl || '',
        gmailUrl: item.gmailUrl || '',
        linkedinUrl: item.linkedinUrl || '',
        proposalUrl: item.proposalUrl || '',
        meetingUrl: item.meetingUrl || '',
        channel: item.channel || '',
        ownerBlocker: item.ownerBlocker || '',
        waitingSince: item.waitingSince || '',
        metricToCheck: item.metricToCheck || '',
        metricDue: item.metricDue || '',
        sourceUrl: item.sourceUrl || '',
        briefUrl: item.briefUrl || '',
        calendarUrl: item.calendarUrl || '',
        driveUrl: item.driveUrl || '',
        designUrl: item.designUrl || '',
        adsUrl: item.adsUrl || '',
        analyticsUrl: item.analyticsUrl || '',
        landingUrl: item.landingUrl || '',
        slackUrl: item.slackUrl || '',
        researchUrl: item.researchUrl || '',
        workType: item.workType || '',
        period: item.period || '',
        lastReminder: item.lastReminder || '',
        questionCount: item.questionCount || '0',
        receiptCount: item.receiptCount || '0',
        qboUrl: item.qboUrl || '',
        xeroUrl: item.xeroUrl || '',
        portalUrl: item.portalUrl || '',
        emailUrl: item.emailUrl || '',
        taxUrl: item.taxUrl || '',
        purchasingType: item.purchasingType || '',
        requester: item.requester || '',
        department: item.department || '',
        poNumber: item.poNumber || '',
        supplier: item.supplier || '',
        sentDate: item.sentDate || '',
        ackStatus: item.ackStatus || (isPurchasing(config) ? 'unknown' : ''),
        etaDate: item.etaDate || '',
        lastFollowup: item.lastFollowup || '',
        approver: item.approver || '',
        quoteRequested: item.quoteRequested || '0',
        quoteReceived: item.quoteReceived || '0',
        quoteMissing: item.quoteMissing || '',
        issueType: item.issueType || '',
        renewalDate: item.renewalDate || '',
        renewalWindow: item.renewalWindow || (isPurchasing(config) ? '60' : ''),
        waitOn: item.waitOn || '',
        erpUrl: item.erpUrl || '',
        quoteFolderUrl: item.quoteFolderUrl || '',
        contractUrl: item.contractUrl || '',
        invoiceUrl: item.invoiceUrl || '',
        devType: item.devType || '',
        repo: item.repo || '',
        branch: item.branch || '',
        resumeNote: item.resumeNote || '',
        blockerType: item.blockerType || '',
        lastActivity: item.lastActivity || '',
        reviewer: item.reviewer || '',
        prStatus: item.prStatus || '',
        ciType: item.ciType || '',
        ciLastRun: item.ciLastRun || '',
        suspectedCause: item.suspectedCause || '',
        risk: item.risk || '',
        module: item.module || '',
        environment: item.environment || (isDeveloper(config) ? 'local' : ''),
        githubUrl: item.githubUrl || '',
        ticketUrl: item.ticketUrl || '',
        prUrl: item.prUrl || '',
        ciUrl: item.ciUrl || '',
        docsUrl: item.docsUrl || '',
        logsUrl: item.logsUrl || '',
        stagingUrl: item.stagingUrl || '',
        source: item.source || '',
        feedbackType: item.feedbackType || '',
        feedbackStatus: item.feedbackStatus || '',
        intent: item.intent || '',
        version: item.version || '',
        currentRevision: item.currentRevision || (isDesign(config) ? '1' : ''),
        revisionLimit: item.revisionLimit || (isDesign(config) ? '3' : ''),
        figmaUrl: item.figmaUrl || '',
        canvaUrl: item.canvaUrl || '',
        adobeUrl: item.adobeUrl || '',
        brandUrl: item.brandUrl || '',
        assetUrl: item.assetUrl || '',
        moodboardUrl: item.moodboardUrl || '',
        feedbackUrl: item.feedbackUrl || '',
        handoffUrl: item.handoffUrl || '',
        clientThreadUrl: item.clientThreadUrl || '',
        workflowType: item.workflowType || (isHR(config) ? hrWorkflowType(item) : ''),
        role: item.role || '',
        startDate: item.startDate || '',
        lastDay: item.lastDay || '',
        requestType: item.requestType || '',
        leaveType: item.leaveType || '',
        leaveStart: item.leaveStart || '',
        leaveEnd: item.leaveEnd || '',
        returnDate: item.returnDate || '',
        benefitDeadline: item.benefitDeadline || '',
        waitingOn: item.waitingOn || '',
        missingItems: item.missingItems || '',
        blocker: item.blocker || '',
        hrisUrl: item.hrisUrl || '',
        payrollUrl: item.payrollUrl || '',
        itTicketUrl: item.itTicketUrl || '',
        benefitsUrl: item.benefitsUrl || '',
        offerUrl: item.offerUrl || '',
        checklistUrl: item.checklistUrl || '',
        checklist: isDeveloper(config) && !item.checklist
          ? developerDefaultChecklist(item.devType || '').join('\n')
          : (isPurchasing(config) && !item.checklist
            ? purchasingDefaultChecklist(item.purchasingType || '').join('\n')
            : (isAccounting(config) && !item.checklist
              ? accountingDefaultChecklist(item.workType || '').join('\n')
              : (isHR(config) && !item.checklist
                ? hrDefaultChecklist(item.workflowType || hrWorkflowType(item)).join('\n')
                : ((isMarketing(config) || isDesign(config)) && !item.checklist ? (config.defaultChecklist || []).join('\n') : (item.checklist || ''))))),
        checklistDone: Array.isArray(item.checklistDone) ? item.checklistDone : [],
        createdAtDate: item.createdAtDate || '',
        date: item.date || todayStr()
      }));
      render();
    });
  }

  function splitChecklist(value) {
    return String(value || '')
      .split(/\n|,/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 12);
  }

  function renderWorkflowLabels(config) {
    if (!config.workflowLabels?.length) return '';
    return `
      <div class="pd-workflow-strip">
        ${config.workflowLabels.map((label) => `<span>${esc(label)}</span>`).join('')}
      </div>
    `;
  }

  function renderExtraFields(config, p) {
    if (!config.extraFields?.length) return '';
    return `
      <div class="pd-form-grid">
        ${config.extraFields.map((field) => {
          const input = field.type === 'select'
            ? `<select class="cfu-input" id="${esc(p)}-${esc(field.key)}-input" ${field.label ? `aria-label="${esc(field.label)}"` : ''}>${(field.options || []).map(([value, label]) => `<option value="${esc(value)}">${esc(label)}</option>`).join('')}</select>`
            : `<input ${[
                `type="${esc(field.type || 'text')}"`,
                `class="cfu-input"`,
                `id="${esc(p)}-${esc(field.key)}-input"`,
                field.placeholder ? `placeholder="${esc(field.placeholder)}"` : '',
                field.label ? `aria-label="${esc(field.label)}"` : '',
                field.min ? `min="${esc(field.min)}"` : '',
                field.step ? `step="${esc(field.step)}"` : ''
              ].filter(Boolean).join(' ')}>`;
          return field.label
            ? `<label class="pd-field-label"><span>${esc(field.label)}</span>${input}</label>`
            : input;
        }).join('')}
      </div>
    `;
  }

  function renderDeskShell(card, config) {
    const p = config.prefix;
    const statuses = (config.statuses || [['due', 'Due today']]).map(([value, label]) =>
      `<option value="${esc(value)}">${esc(label)}</option>`
    ).join('');
    card.innerHTML = `
      <div class="card-header">
        <span class="card-title">${esc(config.title)}</span>
        <button class="btn-add-meeting" id="${esc(p)}-add-btn" title="Add item">+ Add</button>
      </div>
      <div class="pd-stats">
        <span><strong id="${esc(p)}-due-count">0</strong> ${esc(config.dueLabel || 'due')}</span>
        <span><strong id="${esc(p)}-stuck-count">0</strong> ${esc(config.stuckLabel || 'stuck')}</span>
      </div>
      ${renderWorkflowLabels(config)}
      <div class="cfu-form" id="${esc(p)}-form" hidden>
        <input type="text" class="cfu-input" id="${esc(p)}-name-input" placeholder="${esc(config.namePlaceholder || 'Name')}">
        <input type="text" class="cfu-input" id="${esc(p)}-context-input" placeholder="${esc(config.contextPlaceholder || 'Context')}">
        <input type="text" class="cfu-input" id="${esc(p)}-next-input" placeholder="${esc(config.nextPlaceholder || 'Next action')}">
        <input type="url" class="cfu-input" id="${esc(p)}-link-input" placeholder="${esc(config.linkPlaceholder || 'Workspace link')}">
        ${renderExtraFields(config, p)}
        <textarea class="cfu-input pd-checklist-input" id="${esc(p)}-checklist-input" rows="2" placeholder="${esc(config.checklistPlaceholder || 'Checklist / notes, separated by commas or lines')}"></textarea>
        <div class="cfu-form-row">
          <input type="date" class="cfu-input cfu-input-sm" id="${esc(p)}-date-input" aria-label="Due date">
          <select class="cfu-input cfu-input-sm" id="${esc(p)}-status-input" aria-label="Status">${statuses}</select>
        </div>
        <div class="cfu-form-actions">
          <button class="btn-meeting-save" id="${esc(p)}-save-btn">Save</button>
          <button class="btn-meeting-cancel" id="${esc(p)}-cancel-btn">Cancel</button>
        </div>
      </div>
      <div class="cfu-empty" id="${esc(p)}-empty" hidden>${esc(config.emptyText || 'No items yet.')}</div>
      <div class="card-footer-content cfu-body" id="${esc(p)}-body">
        <div class="cfu-section" id="${esc(p)}-priority-section" hidden>
          <div class="cfu-section-label">${esc(config.priorityTitle || 'Priority')} <span class="cfu-section-count" id="${esc(p)}-priority-count"></span></div>
          <div class="cfu-list" id="${esc(p)}-priority-list"></div>
        </div>
        <div class="cfu-section" id="${esc(p)}-stuck-section" hidden>
          <div class="cfu-section-label">${esc(config.stuckTitle || 'Stuck')} <span class="cfu-section-count" id="${esc(p)}-stuck-section-count"></span></div>
          <div class="cfu-list" id="${esc(p)}-stuck-list"></div>
        </div>
        <div class="cfu-section" id="${esc(p)}-backlog-section" hidden>
          <div class="cfu-section-label">${esc(config.backlogTitle || 'Backlog')} <span class="cfu-section-count" id="${esc(p)}-backlog-count"></span></div>
          <div class="cfu-list" id="${esc(p)}-backlog-list"></div>
        </div>
      </div>
      <div class="card-link-footer">
        <a class="note-link" href="#" id="${esc(p)}-open-all">View all -></a>
      </div>
    `;
  }

  DESKS.forEach(initDesk);
})();
