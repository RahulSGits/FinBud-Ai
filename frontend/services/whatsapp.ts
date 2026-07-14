import { db } from '@/lib/db';

interface SendWhatsAppParams {
  organizationId: string;
  recipientPhone: string;
  templateName?: string;
  messageBody?: string;
  contactId?: string;
  callLogId?: string;
  variables?: string[];
}

export class WhatsAppService {
  /**
   * Sends a WhatsApp message (template or raw text) via the WhatsApp Business API.
   * Maintains a complete log in the database.
   */
  static async sendMessage({
    organizationId,
    recipientPhone,
    templateName,
    messageBody,
    contactId,
    callLogId,
    variables = []
  }: SendWhatsAppParams) {
    // 1. Fetch organization WhatsApp settings
    const settings = await db.whatsAppSettings.findUnique({
      where: { organizationId }
    });

    if (!settings || !settings.isActive) {
      console.warn(`WhatsApp is not configured or is inactive for organization ${organizationId}`);
      return { success: false, error: 'WhatsApp not configured' };
    }

    // 2. Format phone number (Meta requires country code without + or leading zeros)
    // Exotel requires E.164 without the +, so just numbers is fine for India e.g. 919876543210
    const formattedPhone = recipientPhone.replace(/[^0-9]/g, '');

    // 3. Prepare payload for Exotel WhatsApp API
    const auth = Buffer.from(`${settings.apiKey}:${settings.apiToken}`).toString('base64');
    const url = `https://${settings.subdomain}/v2/accounts/${settings.accountSid}/messages`;

    let content: any = {};
    if (templateName) {
      content = {
        type: "template",
        template: {
          name: templateName,
          language: { code: "en_US" },
          components: variables.length > 0 ? [
            {
              type: "body",
              parameters: variables.map(text => ({ type: "text", text }))
            }
          ] : []
        }
      };
    } else if (messageBody) {
      content = {
        type: "text",
        text: { body: messageBody }
      };
    } else {
      return { success: false, error: 'Must provide either templateName or messageBody' };
    }

    const payload = {
      whatsapp: {
        messages: [
          {
            from: settings.whatsappNumber,
            to: formattedPhone,
            content
          }
        ]
      }
    };

    // 4. Create the initial message log in DB
    const messageLog = await db.whatsAppMessageLog.create({
      data: {
        organizationId,
        contactId: contactId || null,
        callLogId: callLogId || null,
        recipientPhone: formattedPhone,
        templateName,
        messageBody,
        status: 'sending'
      }
    });

    // 5. Fire request to Exotel
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to send WhatsApp message via Exotel');
      }

      // 6. Update log as sent with Message ID from Exotel
      // Exotel returns something like { response: [ { message_id: '...' } ] }
      const messageId = data.response?.[0]?.message_id || data.message_id || 'unknown';
      
      await db.whatsAppMessageLog.update({
        where: { id: messageLog.id },
        data: { status: 'sent', messageId }
      });

      return { success: true, messageId };

    } catch (error: any) {
      console.error('WhatsApp API Error:', error.message);
      
      // 7. Update log as failed
      await db.whatsAppMessageLog.update({
        where: { id: messageLog.id },
        data: { status: 'failed', error: error.message.slice(0, 200) }
      });
      
      return { success: false, error: error.message };
    }
  }

  /**
   * Evaluates call outcomes against Agent Templates and triggers messages if necessary.
   */
  static async evaluateConditionalTriggers(callLogId: string) {
    const call = await db.callLog.findUnique({
      where: { id: callLogId },
      include: { contact: true }
    });

    if (!call || !call.agentId || !call.contact) return;

    // Fetch all active WhatsApp templates for this specific agent
    const templates = await db.whatsAppTemplate.findMany({
      where: { agentId: call.agentId, isActive: true }
    });

    if (templates.length === 0) return;

    // Determine the "outcome" from the call log (e.g. interested, not_interested, no_answer)
    let outcome = call.status; // 'completed', 'no-answer', 'failed', 'busy'
    if (call.status === 'completed') {
      if (call.interested) {
        outcome = 'interested';
      } else {
        outcome = 'not_interested'; // Default assumption if completed but not interested
      }
    }

    // Find a matching template for this outcome
    const matchedTemplate = templates.find(t => t.triggerOutcome === outcome || t.triggerOutcome === 'all');
    
    if (matchedTemplate) {
      // Try extracting variables (e.g., [Name])
      let parsedBody = matchedTemplate.messageBody;
      let variables: string[] = [];

      if (parsedBody && call.contact.name) {
        parsedBody = parsedBody.replace(/\[Name\]/gi, call.contact.name);
      }

      if (matchedTemplate.templateName && call.contact.name) {
        // If it's a pre-approved meta template, variables must be passed as an array
        variables = [call.contact.name];
      }

      await this.sendMessage({
        organizationId: call.organizationId,
        recipientPhone: call.phone,
        templateName: matchedTemplate.templateName || undefined,
        messageBody: parsedBody || undefined,
        contactId: call.contact.id,
        callLogId: call.id,
        variables
      });
    }
  }
}
