-- Only an authenticated receiving client may acknowledge its direct-message
-- copy. Existing messages remain unknown; server fan-out is not delivery.
ALTER TABLE chat_messages ADD COLUMN recipient_received_at TIMESTAMPTZ;

-- The existing message-owner FK uses ON DELETE SET NULL. Clear its receipt
-- before CHECK runs, so account deletion can continue into thread cascades
-- without preserving an acknowledgment after its recipient ownership is lost.
CREATE FUNCTION clear_direct_message_delivery_on_owner_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    NEW.recipient_received_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_chat_messages_clear_delivery_owner
  BEFORE UPDATE OF user_id ON chat_messages
  FOR EACH ROW EXECUTE FUNCTION clear_direct_message_delivery_on_owner_change();

ALTER TABLE chat_messages ADD CONSTRAINT chat_message_recipient_delivery_kind
  CHECK (recipient_received_at IS NULL OR COALESCE((
    sender_type = 'user' AND client_message_id IS NOT NULL
    AND metadata ->> 'source' = 'direct'
    AND metadata ->> 'senderUserId' IS NOT NULL
    AND metadata ->> 'senderUserId' <> user_id::text
  ), false));
