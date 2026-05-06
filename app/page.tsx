import Link from 'next/link'
import { ArrowRight, Star, Shield, Clock, MapPin, Phone, Gauge, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import VehicleCard from '@/components/VehicleCard'
import { createClient } from '@/lib/supabase/server'
import type { Vehicle } from '@/types'

const FEATURES = [
  {
    icon: Star,
    title: 'Premium Fleet',
    desc: 'Handpicked luxury vehicles maintained to the highest standard.',
  },
  {
    icon: Shield,
    title: 'Full Insurance',
    desc: 'Comprehensive KASKO coverage included in every rental.',
  },
  {
    icon: Clock,
    title: '24/7 Support',
    desc: 'Our concierge team is available around the clock for any assistance.',
  },
  {
    icon: MapPin,
    title: 'Door-to-Door',
    desc: 'Flexible pickup and delivery at airports, hotels, or custom locations.',
  },
]

const HOW_IT_WORKS = [
  { step: '01', title: 'Choose Your Vehicle', desc: 'Browse our premium fleet and select the perfect car for your journey.' },
  { step: '02', title: 'Select Dates & Add-ons', desc: 'Pick your rental period and customise with our optional services.' },
  { step: '03', title: 'Confirm & Enjoy', desc: 'We deliver the vehicle to your door. Drive with confidence.' },
]

export default async function HomePage() {
  const supabase = await createClient()
  const { data: vehicles } = await supabase
    .from('vehicles')
    .select('*')
    .eq('is_available', true)
    .limit(3)
    .order('daily_price', { ascending: false })

  const featuredVehicles = (vehicles as Vehicle[]) ?? []

  return (
    <>
      {/* ── HERO ── */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0 bg-[#111111]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(184,135,70,0.06)_0%,transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(184,135,70,0.04)_0%,transparent_50%)]" />

        {/* Fine grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />

        <div className="container mx-auto px-4 pt-24 pb-16 relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 border border-gold/30 bg-gold/5 rounded-full px-4 py-1.5 text-xs font-semibold text-gold uppercase tracking-widest mb-8">
              <span className="h-1.5 w-1.5 rounded-full bg-gold animate-pulse" />
              Premium Car Rental Service
            </div>

            <h1 className="text-5xl sm:text-6xl md:text-7xl font-black font-montserrat leading-[1.05] tracking-tight mb-6">
              <span className="text-white">Drive the</span>
              <br />
              <span className="text-gold">Extraordinary</span>
            </h1>

            <p className="text-lg sm:text-xl text-zinc-400 max-w-2xl mx-auto leading-relaxed mb-10">
              By The Wave delivers an unparalleled rental experience — premium vehicles,
              concierge delivery, and white-glove service from first to last kilometre.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="xl" asChild>
                <Link href="/fleet">
                  Explore the Fleet
                  <ArrowRight className="h-5 w-5" />
                </Link>
              </Button>
              <Button size="xl" variant="outline" asChild>
                <Link href="/#how-it-works">How It Works</Link>
              </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-6 mt-16 pt-16 border-t border-zinc-800/60 max-w-lg mx-auto">
              {[
                { value: '50+', label: 'Premium Vehicles' },
                { value: '24/7', label: 'Concierge Support' },
                { value: '5★',  label: 'Average Rating' },
              ].map(stat => (
                <div key={stat.label} className="text-center">
                  <p className="text-2xl sm:text-3xl font-black font-montserrat text-gold">{stat.value}</p>
                  <p className="text-xs text-zinc-500 mt-1 uppercase tracking-wider">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Decorative line */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent" />
      </section>

      {/* ── FEATURES ── */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <p className="text-xs font-semibold text-gold uppercase tracking-widest mb-3">Why Choose Us</p>
            <h2 className="text-3xl sm:text-4xl font-black font-montserrat text-white">
              The BTW Difference
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {FEATURES.map(f => (
              <Card key={f.title} className="border-zinc-800 bg-zinc-900/50 hover:border-gold/30 transition-colors">
                <CardContent className="p-6">
                  <div className="h-10 w-10 rounded-lg bg-gold/10 border border-gold/20 flex items-center justify-center mb-4">
                    <f.icon className="h-5 w-5 text-gold" />
                  </div>
                  <h3 className="font-bold font-montserrat text-white mb-2">{f.title}</h3>
                  <p className="text-sm text-zinc-400 leading-relaxed">{f.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── FLEET PREVIEW ── */}
      {featuredVehicles.length > 0 && (
        <section className="py-20 bg-zinc-950/60">
          <div className="container mx-auto px-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-12">
              <div>
                <p className="text-xs font-semibold text-gold uppercase tracking-widest mb-2">Our Fleet</p>
                <h2 className="text-3xl sm:text-4xl font-black font-montserrat text-white">
                  Featured Vehicles
                </h2>
              </div>
              <Button variant="outline" asChild>
                <Link href="/fleet">View All <ArrowRight className="h-4 w-4" /></Link>
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {featuredVehicles.map((vehicle, i) => (
                <VehicleCard key={vehicle.id} vehicle={vehicle} featured={i === 0} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── HOW IT WORKS ── */}
      <section id="how-it-works" className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <p className="text-xs font-semibold text-gold uppercase tracking-widest mb-3">Simple Process</p>
            <h2 className="text-3xl sm:text-4xl font-black font-montserrat text-white">How It Works</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {HOW_IT_WORKS.map((item, i) => (
              <div key={item.step} className="relative text-center">
                {i < HOW_IT_WORKS.length - 1 && (
                  <div className="hidden md:block absolute top-8 left-1/2 w-full h-px bg-gradient-to-r from-gold/40 to-transparent" />
                )}
                <div className="relative z-10">
                  <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-gold-gradient text-rich-black text-2xl font-black font-montserrat mb-4">
                    {item.step}
                  </div>
                  <h3 className="text-lg font-bold font-montserrat text-white mb-2">{item.title}</h3>
                  <p className="text-sm text-zinc-400 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA BANNER ── */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="relative rounded-2xl overflow-hidden border border-gold/20 bg-zinc-900">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(184,135,70,0.08)_0%,transparent_70%)]" />
            <div className="relative z-10 text-center py-16 px-6">
              <h2 className="text-3xl sm:text-4xl font-black font-montserrat text-white mb-4">
                Ready to Drive in Style?
              </h2>
              <p className="text-zinc-400 mb-8 max-w-md mx-auto">
                Browse our full fleet and reserve your premium vehicle in minutes.
              </p>
              <Button size="xl" asChild>
                <Link href="/fleet">
                  Book Your Car Now
                  <ArrowRight className="h-5 w-5" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ── CONTACT ── */}
      <section id="contact" className="py-20 border-t border-zinc-800">
        <div className="container mx-auto px-4">
          <div className="max-w-lg mx-auto text-center">
            <p className="text-xs font-semibold text-gold uppercase tracking-widest mb-3">Get In Touch</p>
            <h2 className="text-3xl font-black font-montserrat text-white mb-6">Contact Us</h2>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="tel:+420800000000"
                className="flex items-center gap-2 text-zinc-300 hover:text-gold transition-colors"
              >
                <Phone className="h-4 w-4 text-gold" /> +420 800 000 000
              </a>
              <a
                href="mailto:hello@bythwave.com"
                className="flex items-center gap-2 text-zinc-300 hover:text-gold transition-colors"
              >
                <Gauge className="h-4 w-4 text-gold" /> hello@bythwave.com
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
