-- Dev-only seed data mirroring the current localStorage sample data, for local testing.
INSERT INTO classes (id, name, teacher_id) VALUES
  ('C001','Class 1',NULL),
  ('C002','Class 2',NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO students (id, forename, surname, dob, class, parent1_name, parent1_phone, parent2_name, parent2_phone, weekly_fee, enroll_date, status, notes) VALUES
  ('S001','Mubarak','Abubakr','2009-08-25','Class 1','Muhammad Amin','07774527065','','',15,'2025-09-01','Active',''),
  ('S002','Musfira','Amin','2019-04-06','Class 1','Zainab Amin','07459503984','','',15,'2025-09-01','Active',''),
  ('S003','Hussain','Mahomed','2014-02-27','Class 1','Mariam Mahomed','07445212224','Tahir Mahomed','07930900069',15,'2025-09-01','Active',''),
  ('S004','Hassan','Mahomed','2015-04-12','Class 1','Mariam Mahomed','07445212224','Tahir Mahomed','07930900069',15,'2025-09-01','Active',''),
  ('S005','Aiman','Ahmed','2019-08-10','Class 1','Faiso Gedi','07985638070','','',15,'2025-09-01','Active',''),
  ('S006','Ikhlaas','Omar','2019-10-30','Class 1','Ifrah Gedi','07504738490','','',15,'2025-09-01','Active',''),
  ('S007','Hashim','Haque','2016-11-09','Class 1','Aliya Haque','07792145887','Qasim Haque','',15,'2025-09-01','Active',''),
  ('S008','Noor','Ali','2016-03-08','Class 1','Sara Mahomed','07802362938','','',15,'2025-09-01','Active',''),
  ('S009','Ilyas','Corneh','2011-11-02','Class 1','Miatta Gassama','07957752470','','',15,'2025-09-01','Active',''),
  ('S010','Imaan','Mahomed','2018-12-25','Class 1','Junaid Mahomed','07842694211','','',15,'2025-03-07','Active',''),
  ('S011','Zaydaan','Mahomed','2021-04-09','Class 1','Junaid Mahomed','07842694210','','',15,'2025-03-07','Active',''),
  ('S012','Aya','Memon','2016-12-22','Class 2','Abdul Memon','07432801976','Fatima Memon','07583900051',15,'2025-09-01','Active',''),
  ('S013','Hannah','Memon','2020-04-02','Class 2','Abdul Memon','07432801976','Fatima Memon','07583900051',15,'2025-09-01','Active',''),
  ('S014','Yusuf','Tayub','2015-06-16','Class 2','Ahmad Tayub','07979793434','','',15,'2025-09-01','Active',''),
  ('S015','Azhaar','Mukhtar','2013-12-20','Class 2','Amina Cadey','07939841129','','',12,'2025-09-01','Active',''),
  ('S016','Abyan','Mukhtar','2015-06-10','Class 2','Amina Cadey','07939841129','','',12,'2025-09-01','Active',''),
  ('S017','Almaas','Mukhtar','2011-11-30','Class 2','Amina Cadey','07939841129','','',12,'2025-09-01','Active',''),
  ('S018','Afnaan','Mukhtar','2018-11-20','Class 2','Amina Cadey','07939841129','','',12,'2025-09-01','Active',''),
  ('S019','Muhammad','Shah','2019-10-19','Class 2','Femi Shah','07957661143','Ahmed Shah','07533659535',10,'2025-09-01','Active',''),
  ('S020','Usman','Arshad','2012-01-31','Class 2','Arshad Sattar','07886203394','Fauzia Arshad','07809506601',15,'2025-09-01','Active',''),
  ('S021','Eesa','Saleem','2012-05-17','Class 2','Zahrah Saleem','07837235163','','',15,'2025-09-01','Active',''),
  ('S022','Mahdia','Miah','2016-10-06','Class 2','Fahima Begum','07473607188','','',15,'2025-04-06','Active',''),
  ('S023','Mariam','Miah','2018-03-11','Class 2','Fahima Begum','07473607188','','',15,'2025-04-06','Active',''),
  ('S024','Mahiba','Miah','2019-05-09','Class 2','Fahima Begum','07473607188','','',15,'2025-04-06','Active',''),
  ('S025','Safaa','Arshad','2010-01-01','Class 2','Arshad Sattar','07886203394','Fauzia Arshad','07809506601',15,'2025-09-01','Active','')
ON CONFLICT (id) DO NOTHING;
