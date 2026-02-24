'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useToast } from '@/providers/toast-provider';

const US_STATES = [
  { value: 'AL', label: 'Alabama' },
  { value: 'AK', label: 'Alaska' },
  { value: 'AZ', label: 'Arizona' },
  { value: 'AR', label: 'Arkansas' },
  { value: 'CA', label: 'California' },
  { value: 'CO', label: 'Colorado' },
  { value: 'CT', label: 'Connecticut' },
  { value: 'DE', label: 'Delaware' },
  { value: 'FL', label: 'Florida' },
  { value: 'GA', label: 'Georgia' },
  { value: 'HI', label: 'Hawaii' },
  { value: 'ID', label: 'Idaho' },
  { value: 'IL', label: 'Illinois' },
  { value: 'IN', label: 'Indiana' },
  { value: 'IA', label: 'Iowa' },
  { value: 'KS', label: 'Kansas' },
  { value: 'KY', label: 'Kentucky' },
  { value: 'LA', label: 'Louisiana' },
  { value: 'ME', label: 'Maine' },
  { value: 'MD', label: 'Maryland' },
  { value: 'MA', label: 'Massachusetts' },
  { value: 'MI', label: 'Michigan' },
  { value: 'MN', label: 'Minnesota' },
  { value: 'MS', label: 'Mississippi' },
  { value: 'MO', label: 'Missouri' },
  { value: 'MT', label: 'Montana' },
  { value: 'NE', label: 'Nebraska' },
  { value: 'NV', label: 'Nevada' },
  { value: 'NH', label: 'New Hampshire' },
  { value: 'NJ', label: 'New Jersey' },
  { value: 'NM', label: 'New Mexico' },
  { value: 'NY', label: 'New York' },
  { value: 'NC', label: 'North Carolina' },
  { value: 'ND', label: 'North Dakota' },
  { value: 'OH', label: 'Ohio' },
  { value: 'OK', label: 'Oklahoma' },
  { value: 'OR', label: 'Oregon' },
  { value: 'PA', label: 'Pennsylvania' },
  { value: 'RI', label: 'Rhode Island' },
  { value: 'SC', label: 'South Carolina' },
  { value: 'SD', label: 'South Dakota' },
  { value: 'TN', label: 'Tennessee' },
  { value: 'TX', label: 'Texas' },
  { value: 'UT', label: 'Utah' },
  { value: 'VT', label: 'Vermont' },
  { value: 'VA', label: 'Virginia' },
  { value: 'WA', label: 'Washington' },
  { value: 'WV', label: 'West Virginia' },
  { value: 'WI', label: 'Wisconsin' },
  { value: 'WY', label: 'Wyoming' },
  { value: 'DC', label: 'District of Columbia' },
];

const PROPERTY_TYPES = [
  { value: 'single_family', label: 'Single Family' },
  { value: 'condo', label: 'Condo' },
  { value: 'townhouse', label: 'Townhouse' },
  { value: 'multi_family', label: 'Multi-Family' },
  { value: 'land', label: 'Land' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'other', label: 'Other' },
];

interface FormErrors {
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  price?: string;
  bedrooms?: string;
  bathrooms?: string;
  square_feet?: string;
}

export default function NewListingPage() {
  const router = useRouter();
  const { addToast } = useToast();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  // Form state
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [price, setPrice] = useState('');
  const [bedrooms, setBedrooms] = useState('');
  const [bathrooms, setBathrooms] = useState('');
  const [squareFeet, setSquareFeet] = useState('');
  const [description, setDescription] = useState('');
  const [propertyType, setPropertyType] = useState('');
  const [mlsNumber, setMlsNumber] = useState('');

  const validate = (): boolean => {
    const newErrors: FormErrors = {};

    if (!address.trim()) newErrors.address = 'Address is required';
    if (!city.trim()) newErrors.city = 'City is required';
    if (!state) newErrors.state = 'State is required';
    if (!zipCode.trim()) newErrors.zip_code = 'ZIP code is required';
    else if (!/^\d{5}(-\d{4})?$/.test(zipCode.trim())) newErrors.zip_code = 'Enter a valid ZIP code';

    if (price && isNaN(Number(price))) newErrors.price = 'Price must be a number';
    if (bedrooms && (!Number.isInteger(Number(bedrooms)) || Number(bedrooms) < 0))
      newErrors.bedrooms = 'Bedrooms must be a non-negative integer';
    if (bathrooms && (isNaN(Number(bathrooms)) || Number(bathrooms) < 0))
      newErrors.bathrooms = 'Bathrooms must be a non-negative number';
    if (squareFeet && (!Number.isInteger(Number(squareFeet)) || Number(squareFeet) < 0))
      newErrors.square_feet = 'Square feet must be a non-negative integer';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    setIsSubmitting(true);

    try {
      const body: Record<string, unknown> = {
        address: address.trim(),
        city: city.trim(),
        state,
        zip_code: zipCode.trim(),
      };

      if (price) body.price = Number(price);
      if (bedrooms) body.bedrooms = Number(bedrooms);
      if (bathrooms) body.bathrooms = Number(bathrooms);
      if (squareFeet) body.square_feet = Number(squareFeet);
      if (description.trim()) body.description = description.trim();
      if (propertyType) body.property_type = propertyType;
      if (mlsNumber.trim()) body.mls_number = mlsNumber.trim();

      const res = await fetch('/api/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error?.message ?? 'Failed to create listing');
      }

      const json = await res.json();
      const newId = json.data?.id;

      addToast({
        type: 'success',
        title: 'Listing created',
        message: 'Your new listing has been created successfully.',
      });

      if (newId) {
        router.push(`/listings/${newId}`);
      } else {
        router.push('/listings');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred';
      addToast({ type: 'error', title: 'Error', message: msg });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Back Link */}
      <button
        onClick={() => router.push('/listings')}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Listings
      </button>

      <Card>
        <CardHeader>
          <CardTitle>Create New Listing</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Address */}
            <Input
              label="Address"
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="123 Main Street"
              error={errors.address}
              disabled={isSubmitting}
            />

            {/* City / State / ZIP */}
            <div className="grid gap-4 sm:grid-cols-3">
              <Input
                label="City"
                required
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Los Angeles"
                error={errors.city}
                disabled={isSubmitting}
              />
              <Select
                label="State"
                required
                options={US_STATES}
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="Select state"
                error={errors.state}
                disabled={isSubmitting}
              />
              <Input
                label="ZIP Code"
                required
                value={zipCode}
                onChange={(e) => setZipCode(e.target.value)}
                placeholder="90001"
                error={errors.zip_code}
                disabled={isSubmitting}
              />
            </div>

            {/* Price / MLS# */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Price"
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="500000"
                error={errors.price}
                disabled={isSubmitting}
              />
              <Input
                label="MLS Number"
                value={mlsNumber}
                onChange={(e) => setMlsNumber(e.target.value)}
                placeholder="MLS-12345"
                disabled={isSubmitting}
              />
            </div>

            {/* Beds / Baths / SqFt */}
            <div className="grid gap-4 sm:grid-cols-3">
              <Input
                label="Bedrooms"
                type="number"
                value={bedrooms}
                onChange={(e) => setBedrooms(e.target.value)}
                placeholder="3"
                error={errors.bedrooms}
                disabled={isSubmitting}
              />
              <Input
                label="Bathrooms"
                type="number"
                step="0.5"
                value={bathrooms}
                onChange={(e) => setBathrooms(e.target.value)}
                placeholder="2"
                error={errors.bathrooms}
                disabled={isSubmitting}
              />
              <Input
                label="Square Feet"
                type="number"
                value={squareFeet}
                onChange={(e) => setSquareFeet(e.target.value)}
                placeholder="1500"
                error={errors.square_feet}
                disabled={isSubmitting}
              />
            </div>

            {/* Property Type */}
            <Select
              label="Property Type"
              options={PROPERTY_TYPES}
              value={propertyType}
              onChange={(e) => setPropertyType(e.target.value)}
              placeholder="Select property type"
              disabled={isSubmitting}
            />

            {/* Description */}
            <Textarea
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter a property description..."
              rows={5}
              disabled={isSubmitting}
            />

            {/* Submit */}
            <div className="flex justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push('/listings')}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" loading={isSubmitting}>
                <Plus className="h-4 w-4" />
                Create Listing
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
