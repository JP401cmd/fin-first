-- Create the pension-documents storage bucket (private, PDF only, 10MB max)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('pension-documents', 'pension-documents', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- RLS policies: users can only access their own documents (path: {user_id}/...)
CREATE POLICY "Users can upload own pension documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'pension-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can read own pension documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'pension-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can update own pension documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'pension-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete own pension documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'pension-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
