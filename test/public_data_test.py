import importlib.util,json,unittest,tempfile
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('public_data',Path(__file__).parents[1]/'scripts'/'build_public_data.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class PublicDataTests(unittest.TestCase):
 def test_kp_objects_and_legacy_rows(self):
  cases=[[{'time_tag':'2026-09-13T12:00:00','Kp':2.33},{'time_tag':'2026-09-13T15:00:00','Kp':3}], [['time_tag','Kp'],['2026-09-13 15:00:00','3']]]
  for raw in cases:
   with patch.object(m,'get',return_value=json.dumps(raw)):
    last=m.aurora()['readings'][-1];self.assertEqual(last['kp'],3);self.assertEqual(last['time'],'2026-09-13T15:00:00Z')
 def test_expired_and_cancelled_warnings_are_excluded(self):
  def entry(expiry,kind='Alert'):
   return '<entry><c:status>Actual</c:status><c:message_type>'+kind+'</c:message_type><c:expires>'+expiry+'</c:expires></entry>'
  xml='<feed xmlns="http://www.w3.org/2005/Atom" xmlns:c="urn:oasis:names:tc:emergency:cap:1.2">'+entry('2000-01-01T00:00:00Z')+entry('2099-01-01T00:00:00Z','Cancel')+entry('2099-01-01T00:00:00Z')+'</feed>'
  with patch.object(m,'get',return_value=xml):self.assertEqual(len(m.warnings()['alerts']),1)
 def test_failed_update_preserves_original_snapshot_and_timestamp(self):
  with tempfile.TemporaryDirectory() as directory,patch.object(m,'ROOT',Path(directory)):
   p=Path(directory)/'warnings.json';original='{"ok":true,"fetchedAt":"old","alerts":[]}';p.write_text(original)
   def fail():raise ValueError('offline')
   m.build('warnings',fail);self.assertEqual(p.read_text(),original)
if __name__=='__main__':unittest.main()
