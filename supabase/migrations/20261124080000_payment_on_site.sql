-- The public form offers bank transfer and payment on site (cash or card terminal, both
-- under "cash"). "terminal" stays in the enum: staff still record what was actually used.
update public.settings
   set value = (select coalesce(jsonb_agg(m), '[]'::jsonb) from jsonb_array_elements_text(value) m where m <> 'terminal'),
       updated_at = now()
 where key = 'payment_methods' and value ? 'terminal';
