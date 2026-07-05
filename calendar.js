// ===================== AGENDAMENTO NATIVO (dentro do app, sem abrir Google) =====================

let reuniaoLeadIdx = null;

function abrirModalReuniao(idx) {
  reuniaoLeadIdx = idx;
  const l = leadsProsp[idx];
  document.getElementById('reuniao-empresa-nome').textContent = l.empresa || '';
  document.getElementById('reuniao-msg').textContent = '';
  document.getElementById('reuniao-obs').value = '';

  // Lista suspensa de dias: hoje + próximos 30 dias, com mês/ano já embutidos
  const diaSel = document.getElementById('reuniao-dia');
  diaSel.innerHTML = '';
  const hoje = new Date();
  const diasSemana = ['domingo','segunda','terça','quarta','quinta','sexta','sábado'];
  const meses = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  for (let i = 0; i < 30; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + i);
    const iso = d.toISOString().slice(0,10); // já traz ano-mês-dia certo, sem precisar escolher separado
    const label = `${d.getDate()} de ${meses[d.getMonth()]} (${diasSemana[d.getDay()]})${i===0?' — hoje':i===1?' — amanhã':''}`;
    const opt = document.createElement('option');
    opt.value = iso;
    opt.textContent = label;
    diaSel.appendChild(opt);
  }

  // Lista suspensa de horários: 08:00 até 19:00, de 30 em 30 minutos
  const horaSel = document.getElementById('reuniao-horario');
  horaSel.innerHTML = '';
  for (let h = 8; h <= 19; h++) {
    for (let m of [0, 30]) {
      if (h === 19 && m === 30) continue;
      const label = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
      const opt = document.createElement('option');
      opt.value = label;
      opt.textContent = label;
      horaSel.appendChild(opt);
    }
  }

  document.getElementById('modal-reuniao').style.display = 'flex';
}

function fecharModalReuniao() {
  document.getElementById('modal-reuniao').style.display = 'none';
  reuniaoLeadIdx = null;
}

async function confirmarReuniao() {
  if (reuniaoLeadIdx === null) return;
  const l = leadsProsp[reuniaoLeadIdx];
  const dia = document.getElementById('reuniao-dia').value;   // yyyy-mm-dd
  const hora = document.getElementById('reuniao-horario').value; // HH:MM
  const obs = document.getElementById('reuniao-obs').value;
  const msg = document.getElementById('reuniao-msg');
  const btn = document.getElementById('reuniao-confirmar-btn');

  const inicio = new Date(`${dia}T${hora}:00`);
  const fim = new Date(inicio.getTime() + 60*60*1000);

  msg.style.color = 'var(--text2)';
  msg.textContent = 'Agendando...';
  btn.disabled = true;

  try {
    const { data: { session } } = await sb.auth.getSession();
    const resp = await fetch('/api/create-calendar-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
      body: JSON.stringify({
        summary: 'Reunião — ' + (l.empresa || ''),
        description: `Empresa: ${l.empresa||''}\nTelefone: ${l.telefone||''}\nEndereço: ${l.endereco||''}${obs ? '\nObs: '+obs : ''}`,
        start: inicio.toISOString(),
        end: fim.toISOString()
      })
    });
    const result = await resp.json();
    if (!resp.ok) throw new Error(result.error || 'Erro ao agendar');

    leadsProsp[reuniaoLeadIdx].dataReuniao = `${dia} ${hora}`;
    leadsProsp[reuniaoLeadIdx].obsReuniao = obs;
    salvarLeadsProsp();

    msg.style.color = 'var(--green2)';
    msg.textContent = 'Reunião agendada com sucesso!';
    setTimeout(() => { fecharModalReuniao(); renderLeadsProsp(); }, 900);
  } catch (err) {
    msg.style.color = 'var(--red2)';
    msg.textContent = 'Erro: ' + err.message + '. Verifique se o Google Agenda está conectado no painel de Administração.';
  } finally {
    btn.disabled = false;
  }
}
