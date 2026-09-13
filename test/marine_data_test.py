import importlib.util,json,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('marine_data',Path(__file__).parents[1]/'scripts'/'marine_data.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class MarineTests(unittest.TestCase):
 def parse(self,records):
  def num(value):
   try:return float(value)
   except (ValueError,TypeError):return None
  return m.marine(lambda url:json.dumps({'success':True,'result':{'records':records}}),num,'wave')
 def test_missing_values_remain_gaps_and_source_times_are_utc(self):
  rows=[{'Lat':57,'Lon':23,'Datetime':'2026-09-13T01:00:00','Value':'NA'}, {'Lat':57,'Lon':23,'Datetime':'2026-09-13T00:00:00','Value':'0'}]
  result=self.parse(rows)['points'][0]['series']
  self.assertEqual(result,[['2026-09-13T00:00:00+00:00',0],['2026-09-13T01:00:00+00:00',None]])
 def test_empty_or_truncated_results_do_not_replace_a_good_snapshot(self):
  with self.assertRaises(ValueError):self.parse([])
  with self.assertRaises(ValueError):self.parse([{}]*14000)
if __name__=='__main__':unittest.main()
