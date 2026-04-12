import {ImageResponse} from 'next/og';

export const alt =
  'Praxis — Regime-adaptive crypto trading agent with ERC-8004 on-chain validation';
export const size = {width: 1200, height: 630};
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px',
          backgroundColor: '#0b0b0e',
          backgroundImage:
            'linear-gradient(135deg, #050508 0%, #0e0e14 100%)',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 18,
            fontWeight: 500,
            color: '#86868B',
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
          }}
        >
          ERC-8004 · SEPOLIA · PAPER
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: '24px',
              maxWidth: '820px',
            }}
          >
            <div
              style={{
                display: 'flex',
                fontSize: 180,
                fontWeight: 700,
                color: '#F5F5F7',
                letterSpacing: '-0.03em',
                lineHeight: 1,
              }}
            >
              Praxis
            </div>
            <div
              style={{
                display: 'flex',
                fontSize: 44,
                fontWeight: 400,
                color: '#D4D4D8',
                letterSpacing: '-0.01em',
                lineHeight: 1.15,
              }}
            >
              Regime-adaptive crypto trading agent
            </div>
            <div
              style={{
                display: 'flex',
                fontSize: 28,
                fontWeight: 400,
                color: '#8E8E93',
                lineHeight: 1.3,
              }}
            >
              82.5 bps minimum edge · 6 specialist agents · Every decision
              signed on-chain
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'flex-end',
              gap: '24px',
              height: '320px',
            }}
          >
            <div
              style={{
                display: 'flex',
                width: '28px',
                height: '140px',
                backgroundColor: '#5B8CFF',
                opacity: 0.35,
                borderRadius: '4px',
              }}
            />
            <div
              style={{
                display: 'flex',
                width: '28px',
                height: '220px',
                backgroundColor: '#5B8CFF',
                opacity: 0.6,
                borderRadius: '4px',
              }}
            />
            <div
              style={{
                display: 'flex',
                width: '28px',
                height: '300px',
                backgroundColor: '#5B8CFF',
                opacity: 0.95,
                borderRadius: '4px',
              }}
            />
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 20,
            fontWeight: 600,
            color: '#5B8CFF',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
          }}
        >
          praxis-agent.site
        </div>
      </div>
    ),
    {...size},
  );
}
