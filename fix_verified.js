const fs = require('fs');
let app = fs.readFileSync('js/app.js', 'utf8');

function addDateLogic(pattern, replacer) {
  app = app.replace(pattern, replacer);
}

// Circuits
addDateLogic(
  /c\.placeholder = e\.target\.checked;\n\s+SS\.save\(H\);/g,
  `c.placeholder = e.target.checked;
          if (!c.placeholder) c.verifiedDate = new Date().toISOString().split('T')[0];
          else delete c.verifiedDate;
          SS.save(H);`
);

// Registers
addDateLogic(
  /reg\.verified = e\.target\.checked;\n\s+window\.pushCaptureState\(\);\n\s+SS\.save\(H\);/g,
  `reg.verified = e.target.checked;
          if (reg.verified) reg.verifiedDate = new Date().toISOString().split('T')[0];
          else delete reg.verifiedDate;
          window.pushCaptureState();
          SS.save(H);`
);

// Fallback if pushCaptureState wasn't added to the register checkbox (which I didn't!)
addDateLogic(
  /reg\.verified = e\.target\.checked;\n\s+SS\.save\(H\);/g,
  `reg.verified = e.target.checked;
          if (reg.verified) reg.verifiedDate = new Date().toISOString().split('T')[0];
          else delete reg.verifiedDate;
          SS.save(H);`
);

// Outlets
addDateLogic(
  /out\.verified = e\.target\.checked;\n\s+SS\.save\(H\);/g,
  `out.verified = e.target.checked;
          if (out.verified) out.verifiedDate = new Date().toISOString().split('T')[0];
          else delete out.verifiedDate;
          SS.save(H);`
);

// Fixtures
addDateLogic(
  /fix\.verified = e\.target\.checked;\n\s+SS\.save\(H\);/g,
  `fix.verified = e.target.checked;
          if (fix.verified) fix.verifiedDate = new Date().toISOString().split('T')[0];
          else delete fix.verifiedDate;
          SS.save(H);`
);

fs.writeFileSync('js/app.js', app);
console.log("Replaced logic");
